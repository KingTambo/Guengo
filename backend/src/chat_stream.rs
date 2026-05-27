use crate::providers::{self, ChatMessage};
use crate::tts::SpeechLang;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use futures_util::StreamExt;
use serde::Serialize;
use tokio::sync::mpsc;

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ChatStreamEvent {
    Audio {
        sentence_index: u32,
        chunk_index: u32,
        audio: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        sentence: Option<String>,
    },
    Reply {
        reply: String,
        english: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        french: Option<String>,
    },
    Done {
        mode: &'static str,
    },
    Error {
        message: String,
    },
}

struct SentenceBuffer {
    buffer: String,
    early_first_done: bool,
}

impl SentenceBuffer {
    fn new() -> Self {
        Self {
            buffer: String::new(),
            early_first_done: false,
        }
    }

    fn push(&mut self, delta: &str) -> Vec<String> {
        self.buffer.push_str(delta);
        let mut sentences = Vec::new();

        loop {
            let Some(end) = find_sentence_end(&self.buffer) else {
                break;
            };

            let sentence = self.buffer[..=end].trim().to_string();
            let rest = self.buffer[end + 1..].trim_start();
            self.buffer = rest.to_string();

            if !sentence.is_empty() {
                if !self.early_first_done {
                    self.early_first_done = true;
                }
                sentences.push(sentence);
            }
        }

        if !self.early_first_done {
            if let Some(end) = find_early_first_break(&self.buffer) {
                let phrase = self.buffer[..=end].trim().to_string();
                self.buffer = self.buffer[end + 1..].trim_start().to_string();
                if !phrase.is_empty() {
                    self.early_first_done = true;
                    sentences.push(phrase);
                }
            }
        }

        sentences
    }

    fn flush(&mut self) -> Option<String> {
        let rest = self.buffer.trim().to_string();
        self.buffer.clear();
        if rest.is_empty() {
            None
        } else {
            Some(rest)
        }
    }
}

fn find_sentence_end(text: &str) -> Option<usize> {
    for (index, ch) in text.char_indices() {
        if matches!(ch, '!' | '?' | '…') {
            return Some(index);
        }
        if ch == '.' {
            let next = text[index + 1..].chars().next();
            if !matches!(next, Some('.' | 'a'..='z' | 'A'..='Z')) {
                return Some(index);
            }
        }
    }
    None
}

/// Flush the first speakable phrase sooner (comma, short clause) so TTS starts earlier.
fn find_early_first_break(text: &str) -> Option<usize> {
    for (index, ch) in text.char_indices() {
        if matches!(ch, '!' | '?' | '…') {
            return Some(index);
        }
        if ch == '.' {
            let next = text[index + 1..].chars().next();
            if !matches!(next, Some('.' | 'a'..='z' | 'A'..='Z')) {
                return Some(index);
            }
        }
        if matches!(ch, ',' | ';' | ':') && char_count_before(text, index) >= 3 {
            return Some(index);
        }
    }

    if text.chars().count() >= 10 {
        find_last_space_before(text, 10)
    } else {
        None
    }
}

fn char_count_before(text: &str, byte_index: usize) -> usize {
    text[..byte_index].chars().count()
}

fn find_last_space_before(text: &str, max_chars: usize) -> Option<usize> {
    let mut seen = 0usize;
    let mut last_space: Option<usize> = None;

    for (index, ch) in text.char_indices() {
        if ch.is_whitespace() {
            last_space = Some(index);
        }
        seen += 1;
        if seen >= max_chars {
            break;
        }
    }

    last_space
}

pub async fn run_chat_stream(
    topic_id: String,
    messages: Vec<(String, String)>,
    tx: mpsc::Sender<ChatStreamEvent>,
) {
    let provider_messages: Vec<ChatMessage<'_>> = messages
        .iter()
        .map(|(role, content)| ChatMessage {
            role: role.as_str(),
            content: content.as_str(),
        })
        .collect();

    let mut stream = match providers::gemini_stream_deltas(&topic_id, &provider_messages).await {
        Some(stream) => stream,
        None => {
            let _ = tx
                .send(ChatStreamEvent::Error {
                    message: "Gemini stream unavailable".into(),
                })
                .await;
            return;
        }
    };

    let (sentence_tx, mut sentence_rx) = mpsc::channel::<(String, u32)>(8);
    let tx_worker = tx.clone();
    let tts_worker = tokio::spawn(async move {
        while let Some((sentence, sentence_index)) = sentence_rx.recv().await {
            synthesize_sentence(&sentence, sentence_index, &tx_worker).await;
        }
    });

    let mut sentence_buffer = SentenceBuffer::new();
    let mut full_reply = String::new();
    let mut sentence_index = 0u32;
    let mut last_sent_english = String::new();
    let mut last_sent_french: Option<String> = None;

    while let Some(delta) = stream.next().await {
        full_reply.push_str(&delta);

        for sentence in sentence_buffer.push(&delta) {
            let _ = sentence_tx.send((sentence, sentence_index)).await;
            sentence_index += 1;
        }

        try_send_reply(
            &tx,
            &full_reply,
            &mut last_sent_english,
            &mut last_sent_french,
        )
        .await;
    }

    if let Some(tail) = sentence_buffer.flush() {
        let _ = sentence_tx.send((tail, sentence_index)).await;
    }

    drop(sentence_tx);

    try_send_reply(
        &tx,
        &full_reply,
        &mut last_sent_english,
        &mut last_sent_french,
    )
    .await;

    let _ = tts_worker.await;

    let _ = tx
        .send(ChatStreamEvent::Done { mode: "gemini" })
        .await;
}

async fn try_send_reply(
    tx: &mpsc::Sender<ChatStreamEvent>,
    full_reply: &str,
    last_english: &mut String,
    last_french: &mut Option<String>,
) {
    let trimmed = full_reply.trim();
    if trimmed.is_empty() {
        return;
    }

    let display = crate::tts::split_display_parts(trimmed);
    if display.english.trim().is_empty() {
        return;
    }

    if display.english == *last_english && display.french == *last_french {
        return;
    }

    let _ = tx
        .send(ChatStreamEvent::Reply {
            reply: trimmed.to_string(),
            english: display.english.clone(),
            french: display.french.clone(),
        })
        .await;

    *last_english = display.english;
    *last_french = display.french;
}

async fn synthesize_sentence(
    sentence: &str,
    sentence_index: u32,
    tx: &mpsc::Sender<ChatStreamEvent>,
) {
    if !providers::speechify_enabled() {
        return;
    }

    let lines = crate::tts::english_tts_lines(sentence);
    if lines.is_empty() {
        return;
    }

    let english_spoken = lines.join(" ");

    for (chunk_index, line) in lines.into_iter().enumerate() {
        let Some(audio) = providers::speechify_segment(&line, SpeechLang::English).await else {
            continue;
        };

        let _ = tx
            .send(ChatStreamEvent::Audio {
                sentence_index,
                chunk_index: chunk_index as u32,
                audio: STANDARD.encode(audio),
                sentence: if chunk_index == 0 {
                    Some(english_spoken.clone())
                } else {
                    None
                },
            })
            .await;
    }
}
