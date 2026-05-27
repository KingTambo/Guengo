#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SpeechLang {
    English,
    French,
}

impl SpeechLang {
    pub fn as_api_code(self) -> &'static str {
        match self {
            SpeechLang::English => "en",
            SpeechLang::French => "fr",
        }
    }
}

#[derive(Clone, Debug)]
pub struct SpeechSegment {
    pub lang: SpeechLang,
    pub text: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DisplayParts {
    pub english: String,
    pub french: Option<String>,
}

pub fn split_display_parts(text: &str) -> DisplayParts {
    let (italic_french, rest) = extract_italic_blocks(text);
    let mut english = Vec::new();
    let mut french = italic_french;

    for sentence in split_sentences(&rest) {
        let trimmed = sentence.trim();
        if trimmed.is_empty() {
            continue;
        }
        let cleaned = clean_segment_text(trimmed);
        if cleaned.is_empty() {
            continue;
        }
        if is_french_text(trimmed) {
            french.push(cleaned);
        } else {
            english.push(cleaned);
        }
    }

    DisplayParts {
        english: english.join(" "),
        french: if french.is_empty() {
            None
        } else {
            Some(french.join(" "))
        },
    }
}

/// English-only lines to send to TTS — never includes French or italic subtitles.
pub fn english_tts_lines(text: &str) -> Vec<String> {
    let display = split_display_parts(text);
    if display.english.is_empty() {
        return Vec::new();
    }

    split_sentences(&display.english)
        .into_iter()
        .map(|sentence| clean_segment_text(sentence.trim()))
        .filter(|line| !line.is_empty() && is_english_tts(line))
        .collect()
}

pub fn is_english_tts(text: &str) -> bool {
    let cleaned = clean_segment_text(text);
    !cleaned.is_empty() && !is_french_text(text)
}

fn is_french_text(text: &str) -> bool {
    if has_french_accents(text) {
        return true;
    }
    detect_lang(text) == SpeechLang::French
}

fn extract_italic_blocks(text: &str) -> (Vec<String>, String) {
    let mut french = Vec::new();
    let mut rest = String::new();
    let mut in_italic = false;
    let mut current = String::new();

    for ch in text.chars() {
        if ch == '*' {
            if in_italic {
                let cleaned = clean_segment_text(&current);
                if !cleaned.is_empty() {
                    french.push(cleaned);
                }
                current.clear();
                in_italic = false;
            } else {
                if !current.is_empty() {
                    rest.push_str(&current);
                    current.clear();
                }
                in_italic = true;
            }
            continue;
        }

        current.push(ch);
    }

    if !current.is_empty() {
        if in_italic {
            let cleaned = clean_segment_text(&current);
            if !cleaned.is_empty() {
                french.push(cleaned);
            }
        } else {
            rest.push_str(&current);
        }
    }

    (french, rest.trim().to_string())
}

/// Split tutor replies into English / French chunks for display and English-only TTS.
pub fn split_bilingual_segments(text: &str) -> Vec<SpeechSegment> {
    let mut pieces = Vec::new();
    for block in split_quoted_blocks(text) {
        if block.quoted {
            let cleaned = clean_segment_text(&block.text);
            if !cleaned.is_empty() {
                pieces.push(SpeechSegment {
                    lang: SpeechLang::English,
                    text: cleaned,
                });
            }
            continue;
        }

        for sentence in split_sentences(&block.text) {
            push_sentence_segments(&mut pieces, &sentence);
        }
    }

    merge_adjacent(pieces)
}

struct TextBlock {
    text: String,
    quoted: bool,
}

fn split_quoted_blocks(text: &str) -> Vec<TextBlock> {
    let mut blocks = Vec::new();
    let mut current = String::new();
    let mut in_quote = false;
    let mut chars = text.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '"' {
            if in_quote {
                if !current.trim().is_empty() {
                    blocks.push(TextBlock {
                        text: current.trim().to_string(),
                        quoted: true,
                    });
                }
                current.clear();
                in_quote = false;
            } else {
                if !current.trim().is_empty() {
                    blocks.push(TextBlock {
                        text: current.trim().to_string(),
                        quoted: false,
                    });
                }
                current.clear();
                in_quote = true;
            }
            continue;
        }

        current.push(ch);
    }

    if !current.trim().is_empty() {
        blocks.push(TextBlock {
            text: current.trim().to_string(),
            quoted: in_quote,
        });
    }

    if blocks.is_empty() && !text.trim().is_empty() {
        blocks.push(TextBlock {
            text: text.trim().to_string(),
            quoted: false,
        });
    }

    blocks
}

fn push_sentence_segments(pieces: &mut Vec<SpeechSegment>, sentence: &str) {
    let trimmed = sentence.trim();
    if trimmed.is_empty() {
        return;
    }

    let lang = detect_lang(trimmed);
    if is_mixed_language(trimmed) {
        for part in split_mixed_clause(trimmed) {
            let part = part.trim();
            if part.is_empty() {
                continue;
            }
            pieces.push(SpeechSegment {
                lang: detect_lang(part),
                text: clean_segment_text(part),
            });
        }
        return;
    }

    pieces.push(SpeechSegment {
        lang,
        text: clean_segment_text(trimmed),
    });
}

fn is_mixed_language(text: &str) -> bool {
    let (french, english) = lang_scores(text);
    french >= 1 && english >= 1
}

fn split_sentences(text: &str) -> Vec<String> {
    let mut sentences = Vec::new();
    let mut current = String::new();

    for ch in text.chars() {
        current.push(ch);
        if matches!(ch, '.' | '!' | '?' | '…') {
            let trimmed = current.trim();
            if !trimmed.is_empty() {
                sentences.push(trimmed.to_string());
            }
            current.clear();
        }
    }

    let tail = current.trim();
    if !tail.is_empty() {
        sentences.push(tail.to_string());
    }

    if sentences.is_empty() && !text.trim().is_empty() {
        sentences.push(text.trim().to_string());
    }

    sentences
}

fn split_mixed_clause(text: &str) -> Vec<String> {
    let mut parts = vec![text.to_string()];

    for sep in [
        " — ", " – ", " ; ", " / ", " | ", ", ou ", ", or ",
        " : ", ": ",
    ] {
        parts = parts
            .into_iter()
            .flat_map(|chunk| split_on_separator(&chunk, sep))
            .collect();
    }

    parts
        .into_iter()
        .flat_map(split_on_ou)
        .filter(|part| !part.trim().is_empty())
        .map(|part| part.trim().to_string())
        .collect()
}

fn split_on_separator(text: &str, sep: &str) -> Vec<String> {
    text.split(sep)
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .map(str::to_string)
        .collect()
}

fn split_on_ou(text: String) -> Vec<String> {
    let lower = text.to_lowercase();
    let mut parts = Vec::new();
    let mut rest = text.as_str();

    for marker in [" ou ", " or "] {
        if let Some(index) = lower.find(marker) {
            let (left, right) = rest.split_at(index);
            if !left.trim().is_empty() {
                parts.push(left.trim().to_string());
            }
            rest = right[marker.len()..].trim();
        }
    }

    if !rest.is_empty() {
        parts.push(rest.to_string());
    }

    if parts.is_empty() {
        vec![text]
    } else {
        parts
    }
}

fn merge_adjacent(segments: Vec<SpeechSegment>) -> Vec<SpeechSegment> {
    let mut merged: Vec<SpeechSegment> = Vec::new();

    for segment in segments {
        if segment.text.trim().is_empty() {
            continue;
        }
        if let Some(last) = merged.last_mut() {
            if last.lang == segment.lang {
                last.text.push(' ');
                last.text.push_str(segment.text.trim());
                continue;
            }
        }
        merged.push(segment);
    }

    merged
}

pub fn clean_segment_text(text: &str) -> String {
    text.replace(['"', '*', '_'], "")
        .replace('…', "...")
        .replace(['—', '–'], ", ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn detect_lang(text: &str) -> SpeechLang {
    let (french_score, english_score) = lang_scores(text);
    if french_score > english_score {
        SpeechLang::French
    } else {
        SpeechLang::English
    }
}

fn has_french_accents(text: &str) -> bool {
    text.chars().any(|c| {
        matches!(
            c,
            'à' | 'â'
                | 'ä'
                | 'é'
                | 'è'
                | 'ê'
                | 'ë'
                | 'ï'
                | 'î'
                | 'ô'
                | 'ù'
                | 'û'
                | 'ü'
                | 'ç'
                | 'œ'
                | 'æ'
                | 'À'
                | 'Â'
                | 'Ä'
                | 'É'
                | 'È'
                | 'Ê'
                | 'Ë'
                | 'Ï'
                | 'Î'
                | 'Ô'
                | 'Ù'
                | 'Û'
                | 'Ü'
                | 'Ç'
                | 'Œ'
                | 'Æ'
        )
    })
}

fn lang_scores(text: &str) -> (usize, usize) {
    let lower = text.to_lowercase();
    let words: Vec<&str> = lower
        .split(|c: char| !c.is_alphanumeric() && c != '\'')
        .filter(|word| !word.is_empty() && word.len() > 1)
        .collect();

    let french_markers = [
        "je", "tu", "vous", "nous", "le", "la", "les", "un", "une", "des", "du", "de", "et", "est",
        "pas", "que", "pour", "avec", "comment", "bonjour", "merci", "français", "francais", "ça",
        "ca", "très", "tres", "oui", "non", "peut", "être", "etre", "dire", "parler", "aide",
        "veux", "peux", "prêt", "pret", "répète", "repète", "repete", "essaye", "essayez", "dis",
        "moi", "aussi", "mais", "donc", "alors", "voilà", "voila", "chez", "sur", "dans", "qui",
        "où", "aux", "cela", "cette", "mon", "ton", "son", "notre", "votre", "leur", "ici", "là",
        "commence", "appelles", "appelle", "francophone", "bloques", "bloque", "phrase", "thème",
        "theme", "préfères", "prefere", "préfère", "si", "en", "au", "tes", "mes", "ses", "ces",
        "tout", "tous", "toute", "toutes", "plus", "encore", "bien", "mal", "très", "tres",
        "parle", "parles", "dis-moi", "dis-le", "celui", "celle", "ceux", "celles", "quoi", "quand",
        "pourquoi", "parce", "comme", "sans", "sous", "entre", "vers", "chez", "depuis", "avant",
        "après", "apres", "maintenant", "aujourd", "hui", "francophones",
    ];

    let english_markers = [
        "the", "and", "you", "your", "hello", "hi", "english", "try", "say", "speak", "repeat",
        "good", "nice", "meet", "name", "what", "how", "where", "when", "why", "can", "could",
        "would", "should", "let", "lets", "ready", "start", "practice", "word", "sentence",
        "topic", "talk", "about", "pick", "choose", "tell", "ask", "answer", "great", "well",
        "done", "perfect", "again", "sound", "pronunciation", "means", "like", "want", "need",
        "help", "learn", "teacher", "tutor", "student", "only", "immersion", "imagine", "order",
        "coffee", "interview", "doctor", "meeting", "role", "from", "this", "that", "with", "have",
        "has", "had", "was", "were", "are", "is", "am", "be", "been", "being", "will", "just",
        "very", "really", "please", "thanks", "thank", "right", "wrong", "correct", "mistake",
    ];

    let mut french = 0;
    let mut english = 0;

    if has_french_accents(text) {
        french += 4;
    }

    for word in &words {
        if french_markers.contains(word) {
            french += 1;
        }
        if english_markers.contains(word) {
            english += 1;
        }
    }

    for phrase in [
        "en français",
        "en francais",
        "dis-le",
        "dis le",
        "si tu",
        "si vous",
        "comment tu",
        "comment vous",
        "c est",
        "c'est",
        "d accord",
        "d'accord",
        "n est",
        "n'est",
        "j ai",
        "j'ai",
        "l anglais",
        "l'anglais",
    ] {
        if lower.contains(phrase) {
            french += 2;
        }
    }

    (french, english)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_display_parts() {
        let parts = split_display_parts("Great job!\n*Bravo !*");
        assert_eq!(parts.english, "Great job!");
        assert_eq!(parts.french.as_deref(), Some("Bravo !"));
    }

    #[test]
    fn italic_french_never_in_tts() {
        let lines = english_tts_lines("Hello!\n*Bonjour !*");
        assert_eq!(lines, vec!["Hello!".to_string()]);
        let parts = split_display_parts("Hello!\n*Bonjour !*");
        assert_eq!(parts.french.as_deref(), Some("Bonjour !"));
    }

    #[test]
    fn french_only_reply_has_no_tts() {
        assert!(english_tts_lines("Bonjour, comment vas-tu ?").is_empty());
    }

    #[test]
    fn splits_quoted_english_inside_french() {
        let parts = split_bilingual_segments(
            "Essaye en anglais: \"Nice to meet you.\" Puis dis-le en français.",
        );
        assert!(parts.iter().any(|p| p.lang == SpeechLang::English && p.text.contains("Nice")));
        assert!(parts.iter().any(|p| p.lang == SpeechLang::French));
    }

    #[test]
    fn splits_mixed_reply() {
        let parts = split_bilingual_segments(
            "Good try! Essaye encore. — ou dis-le en français si tu préfères.",
        );
        assert!(parts.len() >= 2);
        assert_eq!(parts[0].lang, SpeechLang::English);
        assert!(parts.iter().any(|part| part.lang == SpeechLang::French));
    }

    #[test]
    fn keeps_english_only() {
        let parts = split_bilingual_segments("Nice to meet you! What is your name?");
        assert_eq!(parts.len(), 1);
        assert_eq!(parts[0].lang, SpeechLang::English);
    }
}
