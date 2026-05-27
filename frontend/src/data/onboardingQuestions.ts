export type OnboardingQuestion = {
  id: string;
  prompt: string;
  options: { value: string; label: string }[];
};

/** Multiple-choice questions to personalize English voice practice (20 étapes : préférences + motivation). */
export const ONBOARDING_QUESTIONS: OnboardingQuestion[] = [
  {
    id: "english_level",
    prompt: "Comment évaluez-vous votre niveau d’anglais aujourd’hui ?",
    options: [
      { value: "beginner", label: "Débutant — je découvre les bases" },
      { value: "elementary", label: "Élémentaire — je comprends des phrases simples" },
      {
        value: "intermediate",
        label: "Intermédiaire — je peux tenir une conversation",
      },
      { value: "advanced", label: "Avancé — je veux affiner la fluidité" },
    ],
  },
  {
    id: "main_goal",
    prompt: "Quel est votre objectif principal avec Guengo ?",
    options: [
      { value: "travel", label: "Voyager avec plus d’aisance" },
      { value: "work", label: "Anglais professionnel" },
      { value: "studies", label: "Études ou examens" },
      { value: "confidence", label: "Gagner en confiance à l’oral" },
    ],
  },
  {
    id: "weekly_practice",
    prompt: "Combien de temps souhaitez-vous pratiquer par semaine ?",
    options: [
      { value: "under_1h", label: "Moins d’1 h" },
      { value: "1_to_3h", label: "1 à 3 h" },
      { value: "3_to_5h", label: "3 à 5 h" },
      { value: "over_5h", label: "Plus de 5 h" },
    ],
  },
  {
    id: "oral_challenge",
    prompt: "À l’oral, qu’est-ce qui vous pose le plus de difficultés ?",
    options: [
      { value: "listening", label: "Comprendre à l’écoute (vitesse, accents)" },
      { value: "hesitation", label: "Trouver mes mots, bloquer sous pression" },
      { value: "pronunciation", label: "Prononciation et intonation" },
      {
        value: "confidence",
        label: "Stress / peur de me tromper même si je comprends",
      },
    ],
  },
  {
    id: "conversation_topics",
    prompt: "Quels types de sujets vous motivent pour parler ?",
    options: [
      { value: "daily_life", label: "Vie quotidienne, voyages, loisirs" },
      {
        value: "work_studies",
        label: "Travail, projets académiques ou entretiens",
      },
      { value: "culture", label: "Culture, médias, actu léger" },
      { value: "mixed", label: "Un peu de tout selon les sessions" },
    ],
  },
  {
    id: "tutor_speech_speed",
    prompt:
      "Quel débit préférez-vous pendant les premières phrases du tuteur ?",
    options: [
      {
        value: "slow_clear",
        label: "Assez lent et très clair au début",
      },
      {
        value: "natural",
        label: "Rythme naturel, proche d’une conversation courante",
      },
      {
        value: "challenging",
        label: "Plus rapide pour m’habituer à l’écoute réelle",
      },
      {
        value: "adaptive",
        label: "Qu’il s’adapte à mon niveau dans la session",
      },
    ],
  },
  {
    id: "typical_session_length",
    prompt: "Quelle durée vous semble réaliste pour une session vocale ?",
    options: [
      { value: "under_15", label: "Moins de 15 minutes" },
      { value: "15_to_30", label: "15 à 30 minutes" },
      { value: "30_to_45", label: "30 à 45 minutes" },
      { value: "45_plus", label: "45 minutes ou plus" },
    ],
  },
  {
    id: "correction_style",
    prompt: "Souhaitez-vous quel type de corrections pendant l’échange ?",
    options: [
      {
        value: "frequent",
        label: "Corrections assez fréquentes, je veux précision",
      },
      {
        value: "moderate",
        label: "Un équilibre : fluide, avec quelques corrections",
      },
      {
        value: "minimal",
        label: "Peu d’interruptions — priorité au flux oral",
      },
      {
        value: "end_summary",
        label: "Surtout un court bilan à la fin de la session",
      },
    ],
  },
  {
    id: "english_variant",
    prompt:
      "Avez-vous une préférence pour l’anglais à entraîner (accent / usages) ?",
    options: [
      { value: "american", label: "Plutôt anglais américain" },
      { value: "british", label: "Plutôt britannique" },
      { value: "international", label: "Anglais neutre / international en priorité" },
      { value: "no_pref", label: "Peu importe tant que je m’entraîne" },
    ],
  },
  {
    id: "when_stuck_language",
    prompt:
      "Quand vous bloquez sur une idée, comment le tuteur peut-il le plus vous aider ?",
    options: [
      {
        value: "french_synonym_ok",
        label: "Proposer vite un mot équivalent en français puis repasser en anglais",
      },
      {
        value: "english_hints_only",
        label: "Rester uniquement en anglais (indices, exemples courts)",
      },
      {
        value: "mixed_support",
        label: "Mélanger anglais puis une phrase de repère en français si besoin",
      },
      {
        value: "rephrase_slow",
        label: "Reformuler très simplement la même phrase en anglais, plus lentement",
      },
    ],
  },
  /* ── Bloc « pourquoi c’est important pour vous » : ancrage émotionnel ── */
  {
    id: "life_change_main_hope",
    prompt:
      "Si, dans un an, votre anglais oral vous surprenait vraiment positivement, qu’est-ce qui aurait le plus changé pour vous au quotidien ?",
    options: [
      {
        value: "calm_speaking",
        label: "Un vrai calme quand je dois parler — moins de panique dans le corps",
      },
      {
        value: "doors_open",
        label: "Le sentiment que des portes (travail, études, projets) ne sont plus fermées",
      },
      {
        value: "travel_freedom",
        label: "La liberté de voyager ou de rencontrer des gens sans me sentir « coincé(e) »",
      },
      {
        value: "recognition",
        label: "Être reconnu(e) pour ce que je vaux, pas seulement pour mon accent ou mes hésitations",
      },
    ],
  },
  {
    id: "english_emotional_meaning",
    prompt:
      "Au fond, l’anglais pour vous aujourd’hui, c’est surtout quoi — au-delà des notes ou du CV ?",
    options: [
      {
        value: "self_respect",
        label: "Retrouver du respect pour moi-même quand je prends la parole",
      },
      {
        value: "connection_depth",
        label: "Créer des liens plus vrais avec des gens d’ailleurs ou du travail",
      },
      {
        value: "future_security",
        label: "Me donner des repères et une sécurité pour l’avenir (pro, mobilité…)",
      },
      {
        value: "joy_expression",
        label: "Le plaisir de m’exprimer, de rire, de partager sans tout filtrer en français",
      },
    ],
  },
  {
    id: "pain_without_english",
    prompt:
      "Sans un meilleur niveau oral, quel ressenti vous pesait le plus récemment ? (choisissez ce qui vous parle.)",
    options: [
      {
        value: "regret_opportunities",
        label: "Du regret après une occasion ratée ou une phrase pas dite comme je le voulais",
      },
      {
        value: "shame_embarrassment",
        label:
          "De la gène ou de la honte même quand les autres sont gentils — comme si je « manquais » quelque chose",
      },
      {
        value: "exhaustion_effort",
        label:
          "Une fatigue mentale permanente à tout traduire dans ma tête avant de parler",
      },
      {
        value: "isolation_feeling",
        label:
          "Un sentiment de distance : je comprends vite, mais je ne me sens pas encore « là » avec eux",
      },
    ],
  },
  {
    id: "who_you_become_with_english",
    prompt:
      "Quand vous imaginez votre « vous » qui parle anglais avec plus d’aise, elle ou il ressemble plutôt à…",
    options: [
      {
        value: "braver_version",
        label: "Quelqu’un qui ose prendre place et assumer les faux départs avec humour",
      },
      {
        value: "composed_professional",
        label: "Quelqu’un de posé(e) au travail, crédible et claire même sous pression",
      },
      {
        value: "warm_social",
        label: "Quelqu’un de plus chaleureux(se) avec les gens — joindre sans barrière langue",
      },
      {
        value: "curious_explorer",
        label: "Un curieux qui explore films, voyages et idées sans tout le temps passer par une traduction",
      },
    ],
  },
  {
    id: "dream_moment_emotional",
    prompt:
      "Le premier souvenir « réussi » que vous aimeriez vivre avec votre anglais, ce serait plutôt…",
    options: [
      {
        value: "understood_deeply",
        label: "Être vraiment compris(e), pas seulement poliment toléré(e)",
      },
      {
        value: "natural_sentence",
        label: "Voir une phrase sortir naturellement, sans blocage qui gèle tout",
      },
      {
        value: "shared_laugh",
        label: "Partager un fou rire ou un moment léger comme dans ma langue",
      },
      {
        value: "tell_my_story",
        label: "Raconter une partie de mon histoire ou de mon projet sans me sentir amoindri(e)",
      },
    ],
  },
  {
    id: "english_changes_relationships_work",
    prompt:
      "Dans quelle zone de vie l’anglais ferait‑il la plus grande différence pour votre cœur, pas seulement pour votre agenda ?",
    options: [
      {
        value: "family_abroad_or_mixed",
        label: "La famille ou les proches où l’anglais mélange tout — être plus présent(e)",
      },
      {
        value: "career_voice",
        label: "Le travail : enfin avoir une voix utile aux réunions et aux idées à défendre",
      },
      {
        value: "love_friendship_international",
        label: "Amitié ou vie affective où la langue aujourd’hui limite nos échanges",
      },
      {
        value: "inner_dialogue_peace",
        label: "Surtout en moi : arrêter de me juger après chaque mot anglais dit",
      },
    ],
  },
  {
    id: "fear_to_release",
    prompt:
      "Si vous pouviez lâcher une peur précise autour de l’anglais, ce serait surtout celle-ci :",
    options: [
      {
        value: "fear_of_judgment",
        label:
          "D’être jugé(e) (accent, niveau, de « passer pour pas assez bon(ne) »)",
      },
      {
        value: "fear_forgetting_words",
        label: "De rester sans mots et de figurer dans le vide en public",
      },
      {
        value: "fear_slow_progress",
        label: "De ne jamais « y arriver » malgré les efforts — la déception",
      },
      {
        value: "fear_not_being_myself",
        label: "De ne pas arriver à montrer ma personnalité en anglais",
      },
    ],
  },
  {
    id: "proof_to_yourself",
    prompt:
      "Tenir ce parcours avec Guengo, pour vous, ce serait surtout prouver que…",
    options: [
      {
        value: "i_can_show_up",
        label: "Je peux être constant(e), même les jours sans envie évidente",
      },
      {
        value: "i_am_not_my_accent",
        label: "Mon accent ou mes erreurs ne définissent pas ma valeur",
      },
      {
        value: "late_is_ok",
        label: "Il n’est jamais trop tard pour gagner cette partie de moi",
      },
      {
        value: "courage_possible",
        label: "J’ai le courage de passer de la honte potentielle au risque fécond",
      },
    ],
  },
  {
    id: "prize_after_months_practice",
    prompt:
      "Après quelques mois de pratique régulière, qu’est-ce qui vous donnerait le plus de fierté ?",
    options: [
      {
        value: "fewer_avoidances",
        label:
          "Moins d’élans pour éviter l’anglais — je passe à l’action au lieu de reculer",
      },
      {
        value: "first_real_win_story",
        label: "Un souvenir concret : « cette fois-ci, je l’ai fait » avec du détail",
      },
      {
        value: "others_notice",
        label: "Qu’on remarque le changement autour de moi (sans avoir à le réclamer)",
      },
      {
        value: "kindness_to_self",
        label: "Être devenu(e) bien plus doux(te) avec moi-même lors des erreurs",
      },
    ],
  },
  {
    id: "session_intention_close",
    prompt:
      "Pour finir : quelle intention voulez-vous garder en tête quand vous démarrez une session vocale avec le tuteur ?",
    options: [
      {
        value: "progress_over_perfection",
        label: "L’école est finie pour la perfection ; je joue pour progresser tout de même",
      },
      {
        value: "voice_for_future_me",
        label: "Chaque phrase est une main tendue au futur moi qui en a besoin",
      },
      {
        value: "permission_to_be_messy",
        label:
          "J’ai le droit d’être brouillon(te) ; c’est le prix d’être vivant(e) en langue",
      },
      {
        value: "small_step_honoured",
        label: "Même dix bonnes minutes aujourd’hui, ce n’est pas « rien » — c’est un acte fort",
      },
    ],
  },
];
