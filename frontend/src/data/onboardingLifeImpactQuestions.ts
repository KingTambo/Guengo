import type { OnboardingQuestion } from "./onboardingQuestionTypes";

/** 100 questions sur l'impact émotionnel et existentiel de l'anglais (après le questionnaire technique). */

function optsResonance(): OnboardingQuestion["options"] {
  return [
  { value: "not_really", label: "Presque pas — ce n’est pas ce que je ressens" },
  { value: "a_little", label: "Un peu — ça me touche par moments" },
  { value: "strongly", label: "Beaucoup — je m’y reconnais vraiment" },
  { value: "deeply", label: "Énormément — c’est au cœur de mon envie" },
  ];
}

function optsFuture(): OnboardingQuestion["options"] {
  return [
  { value: "unlikely", label: "Peu probable pour moi aujourd’hui" },
  { value: "possible", label: "Possible si je m’entraîne avec constance" },
  { value: "likely", label: "Très probable — j’y crois pour mon avenir" },
  { value: "certain", label: "Quasiment certain — j’en ai besoin pour avancer" },
  ];
}

function optsHope(): OnboardingQuestion["options"] {
  return [
  { value: "rarely", label: "J’y pense rarement" },
  { value: "sometimes", label: "De temps en temps, ça me traverse l’esprit" },
  { value: "often", label: "Souvent — ça me donne de l’élan" },
  { value: "constantly", label: "Tout le temps — c’est un moteur fort en moi" },
  ];
}

export const ONBOARDING_LIFE_IMPACT_QUESTIONS: OnboardingQuestion[] = [
  {
    id: "life_impact_001",
    prompt:
      "Si vous parliez couramment anglais, à quel point imaginez-vous vous sentir plus libre dans le monde ?",
    options: optsResonance(),
  },
  {
    id: "life_impact_002",
    prompt:
      "Dans quelle mesure l’anglais pourrait vous aider à « oser » des situations où vous vous taisez aujourd’hui ?",
    options: optsFuture(),
  },
  {
    id: "life_impact_003",
    prompt:
      "À quel point sentez-vous que l’anglais ouvrirait des portes professionnelles qui vous semblent fermées ?",
    options: optsHope(),
  },
  {
    id: "life_impact_004",
    prompt:
      "Jusqu’où ressentez-vous que maîtriser l’anglais changerait la façon dont les autres vous perçoivent au travail ?",
    options: optsResonance(),
  },
  {
    id: "life_impact_005",
    prompt:
      "Dans quelle mesure l’anglais vous rapprocherait d’un futur où vous n’auriez plus honte de parler en réunion ?",
    options: optsFuture(),
  },
  {
    id: "life_impact_006",
    prompt:
      "À quel point l’anglais vous aiderait-il à négocier (salaire, conditions, rôle) avec plus d’assurance ?",
    options: optsHope(),
  },
  {
    id: "life_impact_007",
    prompt:
      "Jusqu’où croyez-vous que l’anglais pourrait réduire le sentiment d’être « passé à côté » d’opportunités ?",
    options: optsResonance(),
  },
  {
    id: "life_impact_008",
    prompt:
      "Dans quelle mesure parler anglais vous ferait sentir plus légitime dans votre métier ou vos études ?",
    options: optsFuture(),
  },
  {
    id: "life_impact_009",
    prompt:
      "À quel point l’anglais transformerait votre capacité à apprendre seul (cours, docs, conférences en ligne) ?",
    options: optsHope(),
  },
  {
    id: "life_impact_010",
    prompt:
      "Jusqu’où l’anglais vous donnerait-il l’impression de rattraper un retard par rapport à vos ambitions ?",
    options: optsResonance(),
  },
  {
    id: "life_impact_011",
    prompt:
      "Dans quelle mesure l’anglais vous aiderait à quitter une zone de confort qui vous pèse ?",
    options: optsFuture(),
  },
  {
    id: "life_impact_012",
    prompt:
      "À quel point imaginez-vous que l’anglais rende les voyages moins stressants et plus vrais ?",
    options: optsHope(),
  },
  {
    id: "life_impact_013",
    prompt:
      "Jusqu’où l’anglais vous permettrait-il de créer des liens avec des personnes que vous ne croiseriez pas autrement ?",
    options: optsResonance(),
  },
  {
    id: "life_impact_014",
    prompt:
      "Dans quelle mesure parler anglais changerait la qualité de vos rencontres à l’étranger ?",
    options: optsFuture(),
  },
  {
    id: "life_impact_015",
    prompt:
      "À quel point l’anglais vous rapprocherait de la vie que vous fantasmez quand vous regardez des films ou séries ?",
    options: optsHope(),
  },
  {
    id: "life_impact_016",
    prompt:
      "Jusqu’où sentez-vous que l’anglais vous aiderait à mieux vous intégrer si vous partiez quelques mois ailleurs ?",
    options: optsResonance(),
  },
  {
    id: "life_impact_017",
    prompt:
      "Dans quelle mesure l’anglais réduirait votre peur de « passer pour un fou » dans un pays anglophone ?",
    options: optsFuture(),
  },
  {
    id: "life_impact_018",
    prompt:
      "À quel point maîtriser l’anglais vous donnerait l’envie d’explorer seul(e), sans groupe organisé ?",
    options: optsHope(),
  },
  {
    id: "life_impact_019",
    prompt:
      "Jusqu’où l’anglais vous ouvrirait-il à des friendships profondes malgré la distance ?",
    options: optsResonance(),
  },
  {
    id: "life_impact_020",
    prompt:
      "Dans quelle mesure l’anglais vous aiderait à vous sentir respecté(e) quand vous voyagez ?",
    options: optsFuture(),
  },
  {
    id: "life_impact_021",
    prompt:
      "À quel point l’anglais changerait votre relation avec votre famille (fierté, transmission, exemple) ?",
    options: optsHope(),
  },
  {
    id: "life_impact_022",
    prompt:
      "Jusqu’où l’anglais vous permettrait-il de soutenir un proche migrant ou expatrié plus efficacement ?",
    options: optsResonance(),
  },
  {
    id: "life_impact_023",
    prompt:
      "Dans quelle mesure parler anglais augmenterait la fierté que vous auriez devant vos parents ou grands-parents ?",
    options: optsFuture(),
  },
  {
    id: "life_impact_024",
    prompt:
      "À quel point l’anglais vous rapprocherait de pouvoir expliquer votre parcours à quelqu’un d’important pour vous ?",
    options: optsHope(),
  },
  {
    id: "life_impact_025",
    prompt:
      "Jusqu’où l’anglais vous aiderait à donner une image plus stable et confiante à vos enfants ou futurs enfants ?",
    options: optsResonance(),
  },
  {
    id: "life_impact_026",
    prompt:
      "Dans quelle mesure l’anglais vous permettrait de raconter vos victoires sans vous sentir incomplet(e) linguistiquement ?",
    options: optsFuture(),
  },
  {
    id: "life_impact_027",
    prompt:
      "À quel point sentez-vous que l’anglais calmerait votre angoisse quand quelqu’un parle vite en anglais près de vous ?",
    options: optsHope(),
  },
  {
    id: "life_impact_028",
    prompt:
      "Jusqu’où l’anglais réduirait votre peur du jugement (« mon accent », « mes erreurs ») dans un groupe international ?",
    options: optsResonance(),
  },
  {
    id: "life_impact_029",
    prompt:
      "Dans quelle mesure l’anglais vous ferait passer d’un sentiment d’effacement à celui de participation ?",
    options: optsFuture(),
  },
  {
    id: "life_impact_030",
    prompt:
      "À quel point parler anglais vous aiderait à assumer votre place dans une salle où tout le monde parle anglais ?",
    options: optsHope(),
  },
  {
    id: "life_impact_031",
    prompt:
      "Jusqu’où maîtriser l’anglais diminuerait l’humiliation silencieuse de ne pas suivre une conversation ?",
    options: optsResonance(),
  },
  {
    id: "life_impact_032",
    prompt:
      "Dans quelle mesure l’anglais vous permettrait de rire avec les autres, pas après coup en traduisant ?",
    options: optsFuture(),
  },
  {
    id: "life_impact_033",
    prompt:
      "À quel point l’anglais transformerait votre stress avant un appel visio avec des étrangers ?",
    options: optsHope(),
  },
  {
    id: "life_impact_034",
    prompt:
      "Jusqu’où l’anglais vous ferait sentir digne(e) du poste ou du projet que vous visez ?",
    options: optsResonance(),
  },
  {
    id: "life_impact_035",
    prompt:
      "Dans quelle mesure l’anglais calmerait le syndrome de l’imposteur lorsqu’on vous compare à des profils bilingues ?",
    options: optsFuture(),
  },
  {
    id: "life_impact_036",
    prompt:
      "À quel point l’anglais vous donnerait l’envie de parler première, sans attendre « le bon niveau » ?",
    options: optsHope(),
  },
  {
    id: "life_impact_037",
    prompt:
      "Jusqu’où l’anglais renforcerait votre sentiment d’être compétent(e) dans votre domaine, pas seulement « en cours » ?",
    options: optsResonance(),
  },
  {
    id: "life_impact_038",
    prompt:
      "Dans quelle mesure l’anglais vous aiderait à dire non ou poser vos limites en contexte international ?",
    options: optsFuture(),
  },
  {
    id: "life_impact_039",
    prompt:
      "À quel point maîtriser l’anglais changerait votre image de vous-même le matin dans le miroir ?",
    options: optsHope(),
  },
  {
    id: "life_impact_040",
    prompt:
      "Jusqu’où l’anglais nourrirait votre idée « je mérite ces opportunités » plutôt que « je dois me cacher » ?",
    options: optsResonance(),
  },
  {
    id: "life_impact_041",
    prompt:
      "Dans quelle mesure l’anglais vous rapprocherait d’une vie où vous vous sentez aligné(e) avec vos valeurs ?",
    options: optsFuture(),
  },
  {
    id: "life_impact_042",
    prompt:
      "À quel point l’anglais vous permettrait de défendre une idée qui vous tient à cœur devant des inconnus ?",
    options: optsHope(),
  },
  {
    id: "life_impact_043",
    prompt:
      "Jusqu’où l’anglais vous ouvrirait à des collaborations créatives internationales (musique, art, jeu, projet) ?",
    options: optsResonance(),
  },
  {
    id: "life_impact_044",
    prompt:
      "Dans quelle mesure l’anglais transformerait votre capacité à rêver sans vous dire « pas pour moi » ?",
    options: optsFuture(),
  },
  {
    id: "life_impact_045",
    prompt:
      "À quel point l’anglais vous aiderait à publier ou partager votre travail hors de votre cercle francophone ?",
    options: optsHope(),
  },
  {
    id: "life_impact_046",
    prompt:
      "Jusqu’où l’anglais vous donnerait l’élégance d’exprimer des nuances fines dans une dispute ou un débat calme ?",
    options: optsResonance(),
  },
  {
    id: "life_impact_047",
    prompt:
      "Dans quelle mesure l’anglais vous rapprocherait de mentors, idols ou modèles dont vous suivez le contenu en VO ?",
    options: optsFuture(),
  },
  {
    id: "life_impact_048",
    prompt:
      "À quel point l’anglais augmenterait la profondeur de ce que vous ressentiriez en écoutant de la musique avec les paroles ?",
    options: optsHope(),
  },
  {
    id: "life_impact_049",
    prompt:
      "Jusqu’où l’anglais vous changerait lors d’un burnout culturel (« je bouillonne mais je ne peux pas le dire là-bas ») ?",
    options: optsResonance(),
  },
  {
    id: "life_impact_050",
    prompt:
      "Dans quelle mesure l’anglais vous connecterait à une communauté qui vous fait sentir vu(e) différemment ?",
    options: optsFuture(),
  },
  {
    id: "life_impact_051",
    prompt:
      "À quel point l’anglais vous aiderait à quitter une situation toxique où la langue est une barrière de fuite ?",
    options: optsHope(),
  },
  {
    id: "life_impact_052",
    prompt:
      "Jusqu’où l’anglais ferait partie de votre stratégie de reconstruction après un échec ou une rupture de parcours ?",
    options: optsResonance(),
  },
  {
    id: "life_impact_053",
    prompt:
      "Dans quelle mesure l’anglais serait votre « passeport intérieur » vers une version plus grande de vous-même ?",
    options: optsFuture(),
  },
  {
    id: "life_impact_054",
    prompt:
      "À quel point l’anglais vous éviterait de vivre avec le regret « j’aurais dû apprendre plus tôt » ?",
    options: optsHope(),
  },
  {
    id: "life_impact_055",
    prompt:
      "Jusqu’où l’anglais calmerait la peau de perdre une chance unique faute de mots dans la bonne langue ?",
    options: optsResonance(),
  },
  {
    id: "life_impact_056",
    prompt:
      "Dans quelle mesure l’anglais vous ferait passer de l’observation à l’action quand une porte internationale s’ouvre ?",
    options: optsFuture(),
  },
  {
    id: "life_impact_057",
    prompt:
      "À quel point l’anglais changerait votre capacité à célébrer vos réussites sans les minimiser linguistiquement ?",
    options: optsHope(),
  },
  {
    id: "life_impact_058",
    prompt:
      "Jusqu’où vous sentiriez-vous « entier(ère) » dans une ville comme Londres ou New York après des années de frilosité ?",
    options: optsResonance(),
  },
  {
    id: "life_impact_059",
    prompt:
      "Dans quelle mesure l’anglais vous rapprocherait d’un moment où vous pleureriez de soulagement après un premier succès oral ?",
    options: optsFuture(),
  },
  {
    id: "life_impact_060",
    prompt:
      "À quel point l’anglais représenterait pour vous une preuve tangible que vous tenez vos promesses à vous-même ?",
    options: optsHope(),
  },
  {
    id: "life_impact_061",
    prompt:
      "Jusqu’où l’anglais serait synonyme pour vous de retrouver une énergie enfouie sous la peur du ridicule ?",
    options: optsResonance(),
  },
  {
    id: "life_impact_062",
    prompt:
      "Dans quelle mesure l’anglais vous donnerait l’illusion moins forte et la réalité plus forte « je contrôle une partie de ma vie » ?",
    options: optsFuture(),
  },
  {
    id: "life_impact_063",
    prompt:
      "À quel point vous investiriez émotionnellement dans l’anglais comme dans un pacte avec votre futur moi ?",
    options: optsHope(),
  },
  {
    id: "life_impact_064",
    prompt:
      "Jusqu’où l’anglais effacerait le sentiment « je suis en retard chronique sur la langue mondiale » ?",
    options: optsResonance(),
  },
  {
    id: "life_impact_065",
    prompt:
      "Dans quelle mesure l’anglais rendrait imaginable un téléphone à l’autre bout du monde sans panique préalable ?",
    options: optsFuture(),
  },
  {
    id: "life_impact_066",
    prompt:
      "À quel point l’anglais changerait votre manière de défier les attentes placées trop basses par autrui ou par vous-même ?",
    options: optsHope(),
  },
  {
    id: "life_impact_067",
    prompt:
      "Jusqu’où l’anglais soutiendrait un projet de vie « double culture » où vous êtes fier(e) des deux facettes ?",
    options: optsResonance(),
  },
  {
    id: "life_impact_068",
    prompt:
      "Dans quelle mesure l’anglais vous permettrait de demander un service, un soin, une aide précise à l’étranger sans déshonneur ?",
    options: optsFuture(),
  },
  {
    id: "life_impact_069",
    prompt:
      "À quel point l’anglais réduirait la dépendance affective aux traductions automatiques comme béquilles psychiques ?",
    options: optsHope(),
  },
  {
    id: "life_impact_070",
    prompt:
      "Jusqu’où l’anglais ferait partie d’un récit familial (« chez nous, on élargit nos horizons linguistiques ») ?",
    options: optsResonance(),
  },
  {
    id: "life_impact_071",
    prompt:
      "Dans quelle mesure l’anglais nourrirait votre confiance corporelle (posture voix, présence dans une salle pleine d’angles morts linguistiques) ?",
    options: optsFuture(),
  },
  {
    id: "life_impact_072",
    prompt:
      "À quel point l’anglais changerait votre relation au temps — moins perdre une heure à décoder une consigne importante ?",
    options: optsHope(),
  },
  {
    id: "life_impact_073",
    prompt:
      "Jusqu’où l’anglais rendrait ludique une contrainte (formation obligatoire, mobilité) au lieu de l’éprouver comme une punition ?",
    options: optsResonance(),
  },
  {
    id: "life_impact_074",
    prompt:
      "Dans quelle mesure l’anglais vous permettrait de tenir une promesse (« je rejoindrai l’équipe internationale l’année pro ») ?",
    options: optsFuture(),
  },
  {
    id: "life_impact_075",
    prompt:
      "À quel point l’anglais serait votre allié si demain quelqu’un de décisif pour votre carrière ne parle pas français ?",
    options: optsHope(),
  },
  {
    id: "life_impact_076",
    prompt:
      "Jusqu’où l’anglais apaiserait le petit chant intérieur « ils vont penser que je suis stupide » ?",
    options: optsResonance(),
  },
  {
    id: "life_impact_077",
    prompt:
      "Dans quelle mesure l’anglais ferait passer votre timidité de handicap silencieux à une sensibilité canalisée différemment ?",
    options: optsFuture(),
  },
  {
    id: "life_impact_078",
    prompt:
      "À quel point l’anglais représenterait un acte de soin pour le futur vous fatigué(e) qui n’aura plus à rattraper ?",
    options: optsHope(),
  },
  {
    id: "life_impact_079",
    prompt:
      "Jusqu’où l’anglais vous permettrait de pleinement être vous-même — blagues incluses — dans une autre langue ?",
    options: optsResonance(),
  },
  {
    id: "life_impact_080",
    prompt:
      "Dans quelle mesure l’anglais est liée pour vous à un désir plus large de prendre votre vie au sérieux cette décennie ?",
    options: optsFuture(),
  },
  {
    id: "life_impact_081",
    prompt:
      "À quel point vous sentez-vous que l’anglais est une manière honorable de payer votre dette envers vos rêves d’ados ?",
    options: optsHope(),
  },
  {
    id: "life_impact_082",
    prompt:
      "Jusqu’où l’anglais serait synonyme pour vous de rejoindre des conversations mondiales sans demander la permission d’être là ?",
    options: optsResonance(),
  },
  {
    id: "life_impact_083",
    prompt:
      "Dans quelle mesure l’anglais calmerait l’humiliation diffuse de vivre hors de son socle francophone régulièrement ?",
    options: optsFuture(),
  },
  {
    id: "life_impact_084",
    prompt:
      "À quel point vous imaginez vous sentir léger(e), une fois cette « barrière anglaise » passée après des années ou des mois d’angoisse ?",
    options: optsHope(),
  },
  {
    id: "life_impact_085",
    prompt:
      "Jusqu’où l’anglais vous rapprocherait d’un clic « oui » où vous auriez d’abord fermé la page dans le doute linguistique ?",
    options: optsResonance(),
  },
  {
    id: "life_impact_086",
    prompt:
      "Dans quelle mesure l’anglais vous changerait après un souvenir humiliant lié au langage (école autre chose) dont vous porteriez encore la cicatrice ?",
    options: optsFuture(),
  },
  {
    id: "life_impact_087",
    prompt:
      "À quel point l’anglais ferait changer votre récit (« je subis » → « je choisis où je joue ») ?",
    options: optsHope(),
  },
  {
    id: "life_impact_088",
    prompt:
      "Jusqu’où vous sentirez-vous en paix après un trajet où vous auriez posé trois questions précises sans stress ?",
    options: optsResonance(),
  },
  {
    id: "life_impact_089",
    prompt:
      "Dans quelle mesure l’anglais est connecté dans votre imagination à retrouver votre orgueil légitime de personne brillante sous la couche de la langue ?",
    options: optsFuture(),
  },
  {
    id: "life_impact_090",
    prompt:
      "À quel point l’anglais vous semble indispensable pour éviter une vie où vous fermez régulièrement des onglets de possibilités ?",
    options: optsHope(),
  },
  {
    id: "life_impact_091",
    prompt:
      "Jusqu’où l’anglais vous permettrait de regarder vos années futures sans cet angle mort « tout ce que je perdrai encore parce que j’aurai hésité » ?",
    options: optsResonance(),
  },
  {
    id: "life_impact_092",
    prompt:
      "Dans quelle mesure l’anglais vous rapprocherait d’un désir enfoui : partir, écrire là-bas, enseigner, ou simplement vivre différemment ?",
    options: optsFuture(),
  },
  {
    id: "life_impact_093",
    prompt:
      "À quel point l’anglais nourrirait un sentiment rare : être à la fois ancré(e) chez vous et ouvert au monde avec douceur ?",
    options: optsHope(),
  },
  {
    id: "life_impact_094",
    prompt:
      "Jusqu’où l’anglais ferait changer la texture de vos relations amoureuses ou amicales cosmopolites possibles ou actuelles ?",
    options: optsResonance(),
  },
  {
    id: "life_impact_095",
    prompt:
      "Dans quelle mesure l’anglais vous éviterait l’hypothèque émotionnelle « je dois attendre quelqu’un pour que ce soit lisible là-bas » ?",
    options: optsFuture(),
  },
  {
    id: "life_impact_096",
    prompt:
      "À quel point l’anglais vous rapprocherait d’un clic sur « présenter ma candidature » sans la gorge serrée ?",
    options: optsHope(),
  },
  {
    id: "life_impact_097",
    prompt:
      "Jusqu’où l’anglais rendrait envisageable une réunion famille-internationale sans que vous prépariez chaque silence par peur du ridicule familial élargi ?",
    options: optsResonance(),
  },
  {
    id: "life_impact_098",
    prompt:
      "Dans quelle mesure l’anglais ferait passer votre narration interne « je suis limité » en « ma limite se décale à chaque session » ?",
    options: optsFuture(),
  },
  {
    id: "life_impact_099",
    prompt:
      "À quel point l’anglais semble votre passage obligé pour passer de la colère (« j’aurais mérité autant ») à la construction (« je forge mon espace mondial ») ?",
    options: optsHope(),
  },
  {
    id: "life_impact_100",
    prompt:
      "Jusqu’où l’anglais serait synonyme dans votre vie d’une générosité envers votre futur vous — celui qui aurait osé commencer ?",
    options: optsResonance(),
  },
];
