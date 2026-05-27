/// Prepended/appended around the full tutor `system_instruction` so native-multilingual Voice models retain a hard boundary: listen in FR+EN, speak EN only.
const SPOKEN_OUTPUT_CONTRACT_HEAD: &str = "\
[MANDATORY — SYNTHESIZED SPEECH / AUDIO]
Understand the learner whether they speak English or French — full listening comprehension for both.
Your AUDIO OUTPUT must ALWAYS be British English only. Never speak French aloud — not word, phrase, apology, recap, translation, nor mirroring — even when they just spoke French. On-screen captions add French underneath; do not synthesize French.
---
";

const SPOKEN_OUTPUT_CONTRACT_TAIL: &str = "\
---
[MANDATORY — SYNTHESIZED SPEECH / AUDIO — REPEAT BEFORE EVERY REPLY]
LISTEN in English and French — SPEAK aloud in English ONLY. Mirror zero French in synthesized speech.\n";

const CORE_PROMPT: &str = "\
Guengo: warm English tutor for French speakers.

Language policy (spoken audio):
- Native voice synthesis tends to mimic the learner's spoken language — you must override it. Whenever they speak French, you still pronounce your whole reply aloud in British English only (listen to French, answer in spoken English — never answer them with spoken French, not even a short aside, greeting, or translation). Written French appears only below in captions; your audio track is English-only throughout the session in all cases (French or English learner input).
- Speak only natural British English. Never produce spoken French or any third language — not even briefly (no multilingual fillers, mirrored student tongues you mistook ASR for, greetings, apologies, quotes, jargon, lyrics, idioms outside English unless they are mainstream English phrases).
- Captions mirror this: learners always see your line in English with a Parisian French translation shown below — same pattern whether they just spoke French or English to you. So keep replying in English only; never switch to tutoring them mainly in spoken French because they used French. Do not attempt to supply the French line yourself in speech or text (the app adds it).
- Output language is English only across the session: you must never address the learner in speech or streamed text except in British English plus optional quoted English tutoring examples.
- The student may use English or French; understand both equally well. Assume distorted mic input, accented learner English, sloppy lip-sync pronunciation, noisy ASR, or garbled transcripts are still someone practising English/French unless you hear/sustain clear unmistakable non‑English-non‑French speech — do NOT take a flaky transcript as licence to practise another tongue with them.
- If unclear whether their noise is English/French learners or truly another language: treat it as unclear English/French, and use the English apology below — never match or mirror Spanish/Italian/other just because phonetics looked similar briefly.
- If you cannot confidently understand what they said (noise, gibberish, too vague), OR only after sustained unmistakable proof they clearly spoke outside English/French (not guessing from one odd token), do NOT tutor that turn in another language or guess exotic intent. Respond in short English only: say politely that you did not catch it, that you only work with English or French speech, and ask them to repeat in English or French. Then stop — keep that reply compact (no lesson content until they comply).
- If they mix other languages lightly with clear English/French, focus on the English/French part; if unclear, use the apology pattern above.

Every normal reply — one tight teaching beat in English only: natural British accent, one short teaching point plus one test question. Stay brief — target about 10–18 words total (stretch slightly only when a fixed English phrase cannot be shortened). Skip filler, long lead-ins, recap, or stacked questions. Never mix languages in one sentence.

Teaching rules:
- Stay strictly on the section topic. Never drift to other units.
- Every reply MUST end with a question that tests the student.
- Prefer scenario, explain-your-choice, and compare-formal-vs-informal questions — not just \"repeat after me\".
- Correct gently, then ask again. If they answer or speak French, accept it inwardly — you still tutor them aloud in British English only; then invite them to try their answer again in English.
- If the student goes off-topic, one short redirect, then a question back on topic.";

struct LessonStep {
    instruction: &'static str,
    test_question: &'static str,
}

struct SectionLesson {
    title: &'static str,
    allowed: &'static str,
    forbidden: &'static str,
    vocabulary: &'static str,
    steps: &'static [LessonStep],
}

const L01_S1_LESSON: SectionLesson = SectionLesson {
    title: "Salutations formelles & informelles",
    allowed: "hello, hi, hey, good morning/afternoon/evening, formal vs informal register",
    forbidden: "goodbye, thank you, how are you, introductions, small talk",
    vocabulary: "Hello; Hi, Hey, Morning (informal); Good morning, Good afternoon, Good evening (formal/time-based); How do you do? (very formal, reply is also How do you do?)",
    steps: &[
        LessonStep {
            instruction: "Hello vs Hi — model both briefly, explain formal vs informal register",
            test_question: "Ask a scenario: \"Your boss walks in — Hello or Hi, and why?\"",
        },
        LessonStep {
            instruction: "Good morning — explain when (before noon, polite settings)",
            test_question: "Ask: \"It's nine at the office — what do you say?\"",
        },
        LessonStep {
            instruction: "Good afternoon & Good evening — teach when to use each",
            test_question: "Ask with time: \"You arrive at four — afternoon or evening greeting?\"",
        },
        LessonStep {
            instruction: "Hey & Morning — stress informal only among friends",
            test_question: "Ask: \"Your best friend arrives — Hey, Hi, or Good morning?\"",
        },
        LessonStep {
            instruction: "Scenario challenge — one situation (hotel desk, new colleague, neighbour)",
            test_question: "Ask: \"What do you say, and why?\"",
        },
        LessonStep {
            instruction: "Final test — surprise scenario plus register twist",
            test_question: "Ask: \"Was that formal enough? What would you change?\"",
        },
    ],
};

const UNIT_THEMES: [&str; 20] = [
    "Salutations & se présenter",
    "Être, avoir & questions simples",
    "Nombres, dates & l'heure",
    "Au café & commander",
    "Famille & descriptions",
    "Ma journée & présent simple",
    "Directions & se repérer",
    "Shopping & prix",
    "Passé simple — hier",
    "Au travail — emails & réunions",
    "Santé & chez le médecin",
    "Voyage — hôtel & aéroport",
    "Futur & projets",
    "Opinions & débats légers",
    "Conditionnel & politesse",
    "Entretien d'embauche",
    "Phrasal verbs essentiels",
    "Anglais des affaires",
    "Nuances & idiomes",
    "Évaluation finale — parcours complet",
];

const L1_SECTION_LEARN_TOPICS: [&str; 4] = [
    "formal and informal greetings",
    "how to say goodbye and thank people",
    "how to introduce yourself properly",
    "small talk and first conversations",
];

fn l1_section_opening(part: usize) -> String {
    let topic = L1_SECTION_LEARN_TOPICS
        .get(part - 1)
        .copied()
        .unwrap_or("this topic");
    format!("Hello! Here you will learn {topic}.")
}

fn guided_lesson(level: usize, part: usize) -> Option<&'static SectionLesson> {
    if level == 1 && part == 1 {
        Some(&L01_S1_LESSON)
    } else {
        None
    }
}

fn section_lesson_plan(lesson: &SectionLesson) -> String {
    let mut plan = format!(
        "Section: {}.\nAllowed topics: {}.\nForbidden (other sections cover these): {}.\nVocabulary: {}.\n\nLesson steps (one per exchange — follow the [LESSON] nudge each turn):",
        lesson.title, lesson.allowed, lesson.forbidden, lesson.vocabulary
    );
    for (index, step) in lesson.steps.iter().enumerate() {
        plan.push_str(&format!(
            "\nStep {} — {} Example question style: {}",
            index + 1,
            step.instruction,
            step.test_question
        ));
    }
    plan
}

fn section_focus(level: usize, part: usize, unit_theme: &str) -> String {
    if let Some(lesson) = guided_lesson(level, part) {
        let first_reply = if level == 1 && part == 1 {
            "The section opening was already spoken to the student. Do not repeat it. \
             Your very first spoken reply must teach Step 1 directly."
                .to_string()
        } else {
            let opening = l1_section_opening(part);
            format!(
                "Your very first spoken reply must begin with this opening, then teach Step 1: \"{opening}\""
            )
        };
        return format!("{}\n\n{first_reply}", section_lesson_plan(lesson));
    }

    let scope = section_scope(level, part);
    let mut focus = format!(
        "Level {level} section {part} of \"{unit_theme}\": {scope}. \
         Teach this as a full unit — several vocabulary items, example sentences, guided practice, \
         then a short check. Pace over multiple exchanges; do not cover the whole section in one reply. \
         Stay on this scope only — redirect off-topic answers with a testing question about {scope}."
    );
    if level == 1 {
        let opening = l1_section_opening(part);
        focus.push_str(&format!(
            "\n\nYour very first spoken reply must begin with this opening (then one short question): \"{opening}\""
        ));
    }
    focus
}

const LEVEL_SECTION_SCOPES: [[&str; 4]; 20] = [
    [
        "Formal and informal greetings — hello, hi, good morning/evening, register and context",
        "Goodbye, see you, thank you, you're welcome — full formulas and natural responses",
        "Introducing yourself in depth — name, origin, job, Nice to meet you, mini monologue",
        "Small talk and opening exchanges — How are you, varied replies, follow-up questions",
    ],
    [
        "Verb to be — I am, you are, he/she is, contractions, short questions",
        "To have and possession — I have, do you have, I've got",
        "Questions with do/does — forming questions, yes/no answers, basic wh-questions",
        "Negation and mini-dialogues — don't/doesn't, short realistic exchanges",
    ],
    [
        "Numbers and quantities — 0–100, tens, everyday and price usage",
        "Dates and calendar — days, months, years, saying a date aloud",
        "Time and schedules — telling time, am/pm, appointments",
        "Planning and confirming — combining date, time and place for a full appointment",
    ],
    [
        "Café vocabulary and menu — drinks, sizes, options",
        "Ordering formulas — I'd like, Can I have, for here or to go",
        "Preferences and modifications — with milk, no sugar, extra hot",
        "Paying and handling problems — bill, change, wrong order, polite fixes",
    ],
    [
        "Family members — immediate and extended family vocabulary",
        "Describing people — age, appearance, character, adjectives",
        "Possessives and relationships — my, your, his/her, their",
        "Talking about your family — guided monologue with linked sentences",
    ],
    [
        "Morning routine — wake up, breakfast, commute verbs",
        "Present simple in depth — he/she -s, frequency adverbs, key rules",
        "Activities and habits — work, study, hobbies, regular actions",
        "Describing your day — first, then, after that, full sequencing",
    ],
    [
        "Places in town — bank, station, supermarket, landmarks",
        "Asking for directions — Excuse me, How do I get to, Is it far",
        "Prepositions of place — next to, across from, between",
        "Following and giving directions — turn left, go straight, full dialogue",
    ],
    [
        "Shops and items — clothing, sizes, colours",
        "Prices, sizes and availability — How much, Do you have, Can I try on",
        "Comparing and choosing — cheaper, bigger, better quality",
        "Returns and exchanges — refund, receipt, handling problems with staff",
    ],
    [
        "Common irregular past verbs — went, saw, had, did",
        "Past simple affirmative — yesterday, last week, time markers",
        "Past questions — Did you, When did, What did you do",
        "Telling about yesterday — guided narrative with linked sentences",
    ],
    [
        "Office vocabulary — meeting, deadline, colleague, project",
        "Professional emails and messages — openings, requests, attachments",
        "Meetings and speaking up — agenda, I'd like to add, in my view",
        "Work problems and clarifications — delays, Could you clarify",
    ],
    [
        "Body and symptoms — headache, fever, cough, describing feelings",
        "Medical consultation — I've had since, It hurts when",
        "Pharmacy and treatment — prescription, dosage, side effects",
        "Emergencies and insurance — emergency, insurance card, I need help",
    ],
    [
        "Airport and check-in — boarding pass, gate, security, full airport flow",
        "Hotel and accommodation — reservation, room key, reception requests",
        "Transport and tickets — platform, delay, connection",
        "Travel mishaps — lost luggage, missed flight, getting help",
    ],
    [
        "Will vs going to — plans vs predictions with clear examples",
        "Projects and intentions — next year I will, I'm going to start",
        "Promises and decisions — I'll help, I'm not going to",
        "Future dialogue — full exchange about medium-term plans",
    ],
    [
        "Giving opinions — I think, In my opinion, It seems to me",
        "Agreement and disagreement — I agree, I see your point, but",
        "Preferences and tastes — prefer, can't stand, rather",
        "Structured debate — pros and cons, conclusion, short argument",
    ],
    [
        "Would and could for politeness — Would you like, Could you please",
        "Second conditional — If I were, I would, hypotheticals",
        "Refusing and apologising — I'm afraid I can't, I apologise for",
        "Delicate situations — role-play misunderstanding or difficult request",
    ],
    [
        "Presenting your background — experience, education, strengths",
        "Classic interview questions — why this job, strengths and weaknesses",
        "Skills and concrete examples — STAR method in English",
        "Full mock interview — several linked questions with feedback",
    ],
    [
        "Phrasal verbs up and down — pick up, turn down, give up in context",
        "Phrasal verbs in and out — fill in, run out, work out",
        "Phrasal verbs on and off — put off, carry on, set off",
        "Phrasal verbs in narrative — short story using several phrasal verbs",
    ],
    [
        "Client meetings — introducing yourself, agenda, professional small talk",
        "Commercial negotiation — offer, counter-offer, deal vocabulary",
        "Presentation and pitch — opening, key points, closing a short pitch",
        "Networking and follow-up — staying in touch after a meeting",
    ],
    [
        "Common idioms — break the ice, piece of cake, hit the road",
        "Formal vs informal register — choosing the right level",
        "British expressions — cheers, lovely, quite, typical UK turns",
        "Natural conversation — idioms and nuance in fluent exchange",
    ],
    [
        "Grammar review — tenses, questions, negation from the full course",
        "Vocabulary review — major themes travel, work, daily life",
        "Fluent oral expression — guided 1–2 minute monologue",
        "Final comprehensive oral exam — grammar, vocab, situation, pronunciation",
    ],
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SessionKind {
    Conversation,
    Section,
    Vocabulary,
    Phrases,
    Situation,
    Test,
    Unknown,
}

struct TopicMeta {
    kind: SessionKind,
    level: Option<usize>,
    unit_theme: Option<&'static str>,
    section_part: Option<usize>,
}

fn section_scope(level: usize, part: usize) -> &'static str {
    LEVEL_SECTION_SCOPES
        .get(level - 1)
        .and_then(|sections| sections.get(part - 1))
        .copied()
        .unwrap_or("this unit")
}

fn section_title(level: usize, part: usize) -> &'static str {
    section_scope(level, part)
        .split(" — ")
        .next()
        .unwrap_or("this section")
}

fn parse_topic(topic_id: &str) -> TopicMeta {
    if topic_id == "conversation" {
        return TopicMeta {
            kind: SessionKind::Conversation,
            level: None,
            unit_theme: None,
            section_part: None,
        };
    }

    let Some((level_part, kind_part)) = topic_id.split_once('-') else {
        return TopicMeta {
            kind: SessionKind::Unknown,
            level: None,
            unit_theme: None,
            section_part: None,
        };
    };

    if !level_part.starts_with('L') || level_part.len() != 3 {
        return TopicMeta {
            kind: SessionKind::Unknown,
            level: None,
            unit_theme: None,
            section_part: None,
        };
    }

    let Ok(level) = level_part[1..].parse::<usize>() else {
        return TopicMeta {
            kind: SessionKind::Unknown,
            level: None,
            unit_theme: None,
            section_part: None,
        };
    };

    if level == 0 || level > UNIT_THEMES.len() {
        return TopicMeta {
            kind: SessionKind::Unknown,
            level: None,
            unit_theme: None,
            section_part: None,
        };
    }

    if kind_part.starts_with("section-") {
        if let Ok(part) = kind_part["section-".len()..].parse::<usize>() {
            if (1..=LEVEL_SECTION_SCOPES[0].len()).contains(&part) {
                return TopicMeta {
                    kind: SessionKind::Section,
                    level: Some(level),
                    unit_theme: Some(UNIT_THEMES[level - 1]),
                    section_part: Some(part),
                };
            }
        }
        return TopicMeta {
            kind: SessionKind::Unknown,
            level: None,
            unit_theme: None,
            section_part: None,
        };
    }

    let kind = match kind_part {
        "vocabulary" => SessionKind::Vocabulary,
        "phrases" => SessionKind::Phrases,
        "situation" => SessionKind::Situation,
        "test" => SessionKind::Test,
        _ => SessionKind::Unknown,
    };

    TopicMeta {
        kind,
        level: Some(level),
        unit_theme: Some(UNIT_THEMES[level - 1]),
        section_part: None,
    }
}

fn focus_anchor_instructions(label: &str) -> String {
    format!(
        "Session focus anchor: {}. Prioritize this angle in examples and questions while staying inside the section scope. \
         If the student shifts topic, acknowledge briefly, then steer back with a question tied to this anchor or the current lesson step.",
        label.trim()
    )
}

pub fn system_prompt(topic_id: &str, focus_label: Option<&str>) -> String {
    let meta = parse_topic(topic_id);
    let focus = match meta.kind {
        SessionKind::Conversation => "\
Conversation tutor mode. The session opening was already DELIVERED aloud (bundled intro PCM playback + on-screen text): do not repeat the full welcome verbatim; start as a tutor on the next turn.
Rules for this session:
- The student's FIRST spoken reply after that opening registers today's learning GOAL — infer it only from clear English or French. If you cannot infer it confidently, reply in brief English asking them to state their goal in English or French, following CORE_PROMPT language policy — do not tutor in another language. When clear, restate their goal briefly in ENGLISH, invite one short confirmation if needed, then start teaching toward that goal.
- Stay anchored on that goal until they explicitly shift topic; if they widen the goal naturally, evolve with them.
- Teach in very small beats: introduce one idea, model in a few words, then immediately check understanding — drills, cloze prompts, reformulation asks, pronunciation checks, recall of what you taught one turn earlier, scenarios and \"why/when\" questions. Prefer short spoken turns (same word budget as CORE_PROMPT); never long monologues.
- After feedback on an answer, spiral forward with a slightly harder checkpoint or reuse the weakness in the next mini-probe — same pacing as CORE_PROMPT for ending every turn with a test question suitable to their declared goal."
            .into(),
        SessionKind::Section => section_focus(
            meta.level.unwrap_or(1),
            meta.section_part.unwrap_or(1),
            meta.unit_theme.unwrap_or("this unit"),
        ),
        SessionKind::Vocabulary => format!(
            "Level {} vocabulary for: {}. Teach 3–4 essential words, say each clearly, ask the student to repeat.",
            meta.level.unwrap_or(1),
            meta.unit_theme.unwrap_or("this unit")
        ),
        SessionKind::Phrases => format!(
            "Level {} key phrases for: {}. Teach 2–3 must-know phrases, model each, ask the student to say one back.",
            meta.level.unwrap_or(1),
            meta.unit_theme.unwrap_or("this unit")
        ),
        SessionKind::Situation => format!(
            "Level {} role-play: {}. Play the other role, one follow-up question.",
            meta.level.unwrap_or(1),
            meta.unit_theme.unwrap_or("everyday English")
        ),
        SessionKind::Test => format!(
            "Level {} oral test on: {}. Ask 3 short questions covering grammar, vocab, and situation from this unit. Give brief feedback.",
            meta.level.unwrap_or(1),
            meta.unit_theme.unwrap_or("this unit")
        ),
        SessionKind::Unknown => "Adapt to the student's level.".into(),
    };

    let mut out = format!("{SPOKEN_OUTPUT_CONTRACT_HEAD}{CORE_PROMPT}\n\n{focus}");
    if let Some(l) = focus_label.filter(|s| !s.trim().is_empty()) {
        out.push_str("\n\n");
        out.push_str(&focus_anchor_instructions(l));
    }
    out.push_str(SPOKEN_OUTPUT_CONTRACT_TAIL);
    out
}

pub fn guided_step_count(topic_id: &str) -> usize {
    let meta = parse_topic(topic_id);
    if meta.kind != SessionKind::Section {
        return 0;
    }
    guided_lesson(meta.level.unwrap_or(0), meta.section_part.unwrap_or(0))
        .map(|lesson| lesson.steps.len())
        .unwrap_or(0)
}

/// Cached intro PCM: **`frontend/public/audio/openings/{topic_id}.pcm`** or **`backend/cache/audio`** only.
/// No Gemini at runtime — use `npm run warm:opening-audio` (optional `--synthesize-if-missing` + `GEMINI_API_KEY` generates from Node once).
/// Enabled for `conversation` and for L01-section-1 (guided salutations). Change `welcome_for_topic` copy? Delete the PCM to regenerate once.
pub fn uses_cached_opening(topic_id: &str) -> bool {
    let meta = parse_topic(topic_id);
    if meta.kind == SessionKind::Conversation {
        return true;
    }
    meta.kind == SessionKind::Section
        && meta.level == Some(1)
        && meta.section_part == Some(1)
        && guided_lesson(1, 1).is_some()
}

pub fn turn_nudge(topic_id: &str, step: usize, focus_label: Option<&str>) -> Option<String> {
    let meta = parse_topic(topic_id);
    if meta.kind != SessionKind::Section {
        return None;
    }
    let level = meta.level?;
    let part = meta.section_part?;
    let lesson = guided_lesson(level, part)?;
    let total = lesson.steps.len();
    if step < 1 || step > total {
        return None;
    }
    let step_def = &lesson.steps[step - 1];

    let mut msg = if step == 1 {
        let intro_guard = if uses_cached_opening(topic_id) {
            "The intro may already have been spoken—do not restate generic theory about greetings. "
        } else {
            ""
        };
        format!(
            "[LESSON] Section: {}. Step 1/{total}: {}. {intro_guard}\
             Teach this step: brief English teaching point, then your test question — English speech only per CORE_PROMPT (short word budget). \
             Optionally acknowledge briefly what the student said if helpful. Stay on {} only. Forbidden: {}. \
             {} Do not teach forbidden topics.",
            lesson.title,
            step_def.instruction,
            lesson.allowed,
            lesson.forbidden,
            step_def.test_question,
        )
    } else {
        format!(
            "[LESSON] Section: {}. Step {step}/{total}: {}. \
             Evaluate the student's answer. Stay on {} only. Forbidden: {}. \
             If off-topic, redirect briefly then ask a greeting question. \
             {} Do not teach forbidden topics.",
            lesson.title,
            step_def.instruction,
            lesson.allowed,
            lesson.forbidden,
            step_def.test_question,
        )
    };
    if let Some(l) = focus_label.filter(|s| !s.trim().is_empty()) {
        msg.push_str(&format!(
            " Keep primary anchoring topic in mind: {}.",
            l.trim()
        ));
    }
    Some(msg)
}

pub fn welcome_for_topic(topic_id: &str) -> String {
    let meta = parse_topic(topic_id);
    match meta.kind {
        SessionKind::Conversation => {
            "Hello, I am Guengo, your English tutor. Say clearly what you want to learn."
                .into()
        }
        SessionKind::Section => {
            let level = meta.level.unwrap_or(1);
            let part = meta.section_part.unwrap_or(1);
            if level == 1 {
                l1_section_opening(part)
            } else {
                let title = section_title(level, part);
                format!("Hello! Here you will learn {title}.")
            }
        }
        SessionKind::Vocabulary => format!(
            "Level {} — Vocabulary.",
            meta.level.unwrap_or(1),
        ),
        SessionKind::Phrases => format!(
            "Level {} — Key phrases.",
            meta.level.unwrap_or(1),
        ),
        SessionKind::Situation => format!(
            "Level {} — Role-play.",
            meta.level.unwrap_or(1),
        ),
        SessionKind::Test => format!(
            "Level {} — Oral test.",
            meta.level.unwrap_or(1),
        ),
        SessionKind::Unknown => {
            "Hi! I'm Guengo. Speak in English or French — try: \"Hi, my name is…\" What's your name?"
                .into()
        }
    }
}

pub fn demo_reply(topic_id: &str, user_message: &str) -> String {
    let trimmed = user_message.trim();
    if trimmed.is_empty() {
        return "Say something — in English or French — and I'll help you practice.".into();
    }

    let meta = parse_topic(topic_id);
    match meta.kind {
        SessionKind::Conversation => format!(
            "Good — I heard: \"{trimmed}\". I'll treat that as your goal and test you step by step. \
             Reply in English when you can; if you freeze, short French is fine — I still answer only in English."
        ),
        SessionKind::Section => format!(
            "Good progress on \"{trimmed}\". Let's continue this section — \
             one more example or practice before we move on. Ready?"
        ),
        SessionKind::Vocabulary => format!(
            "Nice! For \"{trimmed}\", let's try one more word from this unit. \
             Can you say it out loud?"
        ),
        SessionKind::Phrases => format!(
            "Good! For \"{trimmed}\", try using one of the key phrases we learned. \
             Want to say it again?"
        ),
        SessionKind::Situation => format!(
            "In that situation (\"{trimmed}\"), stay calm in English and ask a clarifying question. \
             Shall we continue the role-play?"
        ),
        SessionKind::Test => format!(
            "Thanks! For \"{trimmed}\" — good effort. Here's one thing to improve, then question two. \
             Shall we continue?"
        ),
        SessionKind::Unknown => format!(
            "Thanks! You said: \"{trimmed}\". Keep going in English or French — I reply in English only."
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_level_situation_topic() {
        let meta = parse_topic("L05-situation");
        assert_eq!(meta.kind, SessionKind::Situation);
        assert_eq!(meta.level, Some(5));
        assert_eq!(meta.unit_theme, Some("Famille & descriptions"));
    }

    #[test]
    fn parses_level_vocabulary_topic() {
        let meta = parse_topic("L01-vocabulary");
        assert_eq!(meta.kind, SessionKind::Vocabulary);
        assert_eq!(meta.level, Some(1));
        assert_eq!(meta.unit_theme, Some("Salutations & se présenter"));
    }

    #[test]
    fn parses_level_section_topic() {
        let meta = parse_topic("L01-section-2");
        assert_eq!(meta.kind, SessionKind::Section);
        assert_eq!(meta.level, Some(1));
        assert_eq!(meta.section_part, Some(2));
    }

    #[test]
    fn parses_level_section_topic_high_level() {
        let meta = parse_topic("L12-section-3");
        assert_eq!(meta.kind, SessionKind::Section);
        assert_eq!(meta.level, Some(12));
        assert_eq!(meta.section_part, Some(3));
    }

    #[test]
    fn parses_conversation_topic() {
        let meta = parse_topic("conversation");
        assert_eq!(meta.kind, SessionKind::Conversation);
    }

    #[test]
    fn l01_section_1_has_guided_lesson_prompt() {
        let prompt = system_prompt("L01-section-1", None);
        assert!(prompt.contains("Salutations formelles"));
        assert!(prompt.contains("Step 1"));
        assert!(prompt.contains("Forbidden"));
        assert!(prompt.contains("Stay strictly on the section topic"));
        assert!(prompt.contains("Hello vs Hi"));
    }

    #[test]
    fn l01_section_1_system_prompt_includes_focus_anchor() {
        let prompt = system_prompt("L01-section-1", Some("Good morning"));
        assert!(prompt.contains("Session focus anchor"));
        assert!(prompt.contains("Good morning"));
    }

    #[test]
    fn system_prompt_bookends_spoken_output_contract() {
        let prompt = system_prompt("conversation", None);
        assert!(prompt.starts_with("[MANDATORY — SYNTHESIZED SPEECH"));
        assert!(
            prompt.contains("[MANDATORY — SYNTHESIZED SPEECH / AUDIO — REPEAT BEFORE EVERY REPLY]")
        );
        assert!(prompt.ends_with("Mirror zero French in synthesized speech.\n"));
    }

    #[test]
    fn l01_section_1_turn_nudge_step1_teaches_not_evaluate() {
        let nudge = turn_nudge("L01-section-1", 1, None).unwrap();
        assert!(nudge.contains("[LESSON]"));
        assert!(nudge.contains("Step 1/6"));
        assert!(nudge.contains("Teach this step"));
        assert!(!nudge.contains("Evaluate the student's answer"));
    }

    #[test]
    fn l01_section_1_uses_cached_opening() {
        assert!(uses_cached_opening("conversation"));
        assert!(uses_cached_opening("L01-section-1"));
        assert!(!uses_cached_opening("L01-section-2"));
        assert!(!uses_cached_opening("L02-section-1"));
    }

    #[test]
    fn l01_section_1_turn_nudge() {
        assert_eq!(guided_step_count("L01-section-1"), 6);
        assert_eq!(guided_step_count("L01-section-2"), 0);
        let nudge = turn_nudge("L01-section-1", 2, None).unwrap();
        assert!(nudge.contains("[LESSON]"));
        assert!(nudge.contains("Step 2/6"));
        assert!(nudge.contains("Good morning"));
    }
}
