use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::OnceLock;

#[derive(Clone, Deserialize, Serialize)]
pub struct FocusTopic {
    pub id: String,
    pub label: String,
}

static CACHE: OnceLock<HashMap<String, Vec<FocusTopic>>> = OnceLock::new();

fn table() -> &'static HashMap<String, Vec<FocusTopic>> {
    CACHE.get_or_init(|| {
        const RAW: &str = include_str!("../data/session_focus_topics.json");
        serde_json::from_str(RAW).unwrap_or_else(|_| HashMap::new())
    })
}

pub fn topics_for_topic(topic_id: &str) -> Vec<FocusTopic> {
    table().get(topic_id).cloned().unwrap_or_default()
}

pub fn resolve_label(topic_id: &str, focus_id: &str) -> Option<String> {
    let trimmed = focus_id.trim();
    if trimmed.is_empty() {
        return None;
    }
    table().get(topic_id).and_then(|topics| {
        topics
            .iter()
            .find(|t| t.id == trimmed)
            .map(|t| t.label.clone())
    })
}
