export type DemoPersonKey =
  | "nadia"
  | "adaeze"
  | "tunde"
  | "ifeoma"
  | "chidi"
  | "kemi"
  | "emeka"
  | "funmi"
  | "segun"
  | "zainab"
  | "olumide"
  | "ngozi"
  | "yusuf"
  | "amara"
  | "bolaji"
  | "tobi"
  | "halima"
  | "precious"
  | "ines"
  | "rui"
  | "beatriz"
  | "sofia"
  | "tiago"
  | "marta"
  | "joao"
  | "ana"
  | "miguel"
  | "carolina"
  | "duarte"
  | "leonor"
  | "filipa"
  | "rita"
  | "wanjiru"
  | "otieno"
  | "martin"
  | "lucia"
  | "santiago"
  | "valentina"
  | "piotr"
  | "agnieszka"
  | "tomasz"
  | "kasia"
  | "carlo"
  | "bea"
  | "paolo"
  | "angelica"
  | "jericho"
  | "katrina"
  | "migueltan"
  | "rhea"
  | "nico"
  | "joy"
  | "daniel";

export type DemoCommunityKey =
  | "lagos"
  | "lisbon"
  | "nairobi"
  | "buenos-aires"
  | "krakow"
  | "manila";

export type DemoTeamArea = "events" | "finance" | "stake" | "node-operations";

export interface DemoPerson {
  name: string;
  platformRole?: "admin";
  activeCommunity?: DemoCommunityKey;
  createdDaysAgo: number;
}

export interface DemoMembership {
  person: DemoPersonKey;
  role: "owner" | "admin" | "member";
  teams?: DemoTeamName[];
  joinedDaysAgo?: number;
  directory?: boolean;
}

export type DemoTeamName = "Events" | "Treasury";

export const DEMO_TEAMS: Record<DemoTeamName, DemoTeamArea[]> = {
  Events: ["events"],
  Treasury: ["finance", "stake"],
};

export interface DemoEventReportPlan {
  submittedDaysAfter: number;
  by: DemoPersonKey;
  format: "irl" | "online";
  focus: "ai" | "crypto";
  audiences: ReadonlyArray<"general" | "developers" | "academic" | "smb" | "other">;
  theme: string;
  attendees: number;
  kpis: [string, string, string];
  wentWell: string;
  improvements: string;
  nextActions: string;
  partners?: string;
  insights?: string;
}

export interface DemoEvent {
  key: string;
  title: string;
  summary: string;
  venue: string;
  day: number;
  hours?: number;
  status?: "published" | "cancelled";
  attendees?: DemoPersonKey[];
  report?: DemoEventReportPlan;
}

export interface DemoCommunity {
  name: string;
  nodeName: string;
  slug: string;
  timezone: string;
  utcHour: number;
  latitude: number;
  longitude: number;
  createdDaysAgo: number;
  activatedDaysAgo: number;
  profile: {
    summary: string;
    location: string;
    region: string;
    published: boolean;
    channels: Array<{ label: string; url: string }>;
  } | null;
  validator: string | null;
  bulletin?: string;
  people: DemoMembership[];
  events: DemoEvent[];
  teamRequests?: Array<{ person: DemoPersonKey; team: DemoTeamName; daysAgo: number }>;
}

export interface DemoProposal {
  key: string;
  name: string;
  slug: string;
  motivation: string;
  submitter: string;
  daysAgo: number;
  reviewStatus: "pending" | "approved";
  applyStatus: "not_started" | "failed";
  applyError?: string;
}

export const DEMO_EMAIL_DOMAIN = "demo.citynode.test";
export const DEMO_ACCOUNT_SUFFIX = "demo.citynode.testnet";

export const DEMO_PEOPLE: Record<DemoPersonKey, DemoPerson> = {
  nadia: {
    name: "Nadia Rahman",
    platformRole: "admin",
    activeCommunity: "nairobi",
    createdDaysAgo: 400,
  },
  adaeze: { name: "Adaeze Okonkwo", activeCommunity: "lagos", createdDaysAgo: 320 },
  tunde: { name: "Tunde Bakare", activeCommunity: "lagos", createdDaysAgo: 300 },
  ifeoma: { name: "Ifeoma Nwosu", activeCommunity: "lagos", createdDaysAgo: 290 },
  chidi: { name: "Chidi Eze", activeCommunity: "lagos", createdDaysAgo: 82 },
  kemi: { name: "Kemi Adeyemi", activeCommunity: "lagos", createdDaysAgo: 82 },
  emeka: { name: "Emeka Obi", activeCommunity: "lagos", createdDaysAgo: 68 },
  funmi: { name: "Funmi Ajayi", activeCommunity: "lagos", createdDaysAgo: 68 },
  segun: { name: "Segun Afolabi", activeCommunity: "lagos", createdDaysAgo: 54 },
  zainab: { name: "Zainab Bello", activeCommunity: "lagos", createdDaysAgo: 82 },
  olumide: { name: "Olumide Ojo", activeCommunity: "lagos", createdDaysAgo: 82 },
  ngozi: { name: "Ngozi Umeh", activeCommunity: "lagos", createdDaysAgo: 54 },
  yusuf: { name: "Yusuf Danjuma", activeCommunity: "lagos", createdDaysAgo: 40 },
  amara: { name: "Amara Nwachukwu", activeCommunity: "lagos", createdDaysAgo: 26 },
  bolaji: { name: "Bolaji Salami", activeCommunity: "lagos", createdDaysAgo: 26 },
  tobi: { name: "Tobi Adewale", activeCommunity: "lagos", createdDaysAgo: 12 },
  halima: { name: "Halima Musa", activeCommunity: "lagos", createdDaysAgo: 12 },
  precious: { name: "Precious Okon", activeCommunity: "lagos", createdDaysAgo: 5 },
  ines: { name: "Inês Carvalho", activeCommunity: "lisbon", createdDaysAgo: 360 },
  rui: { name: "Rui Matos", activeCommunity: "lisbon", createdDaysAgo: 340 },
  beatriz: { name: "Beatriz Lopes", activeCommunity: "lisbon", createdDaysAgo: 330 },
  sofia: { name: "Sofia Almeida", activeCommunity: "lisbon", createdDaysAgo: 63 },
  tiago: { name: "Tiago Ferreira", activeCommunity: "lisbon", createdDaysAgo: 63 },
  marta: { name: "Marta Sousa", activeCommunity: "lisbon", createdDaysAgo: 63 },
  joao: { name: "João Pereira", activeCommunity: "lisbon", createdDaysAgo: 63 },
  ana: { name: "Ana Rodrigues", activeCommunity: "lisbon", createdDaysAgo: 49 },
  miguel: { name: "Miguel Costa", activeCommunity: "lisbon", createdDaysAgo: 49 },
  carolina: { name: "Carolina Dias", activeCommunity: "lisbon", createdDaysAgo: 35 },
  duarte: { name: "Duarte Silva", activeCommunity: "lisbon", createdDaysAgo: 21 },
  leonor: { name: "Leonor Santos", activeCommunity: "lisbon", createdDaysAgo: 21 },
  filipa: { name: "Filipa Gomes", activeCommunity: "lisbon", createdDaysAgo: 7 },
  rita: { name: "Rita Alves", activeCommunity: "lisbon", createdDaysAgo: 91 },
  wanjiru: { name: "Wanjiru Kamau", activeCommunity: "nairobi", createdDaysAgo: 30 },
  otieno: { name: "Otieno Ouma", activeCommunity: "nairobi", createdDaysAgo: 6 },
  martin: { name: "Martín Sosa", activeCommunity: "buenos-aires", createdDaysAgo: 45 },
  lucia: { name: "Lucía Benítez", activeCommunity: "buenos-aires", createdDaysAgo: 40 },
  santiago: { name: "Santiago Giménez", activeCommunity: "buenos-aires", createdDaysAgo: 16 },
  valentina: { name: "Valentina Ruiz", activeCommunity: "buenos-aires", createdDaysAgo: 11 },
  piotr: { name: "Piotr Zieliński", activeCommunity: "krakow", createdDaysAgo: 250 },
  agnieszka: { name: "Agnieszka Nowak", activeCommunity: "krakow", createdDaysAgo: 64 },
  tomasz: { name: "Tomasz Wójcik", activeCommunity: "krakow", createdDaysAgo: 64 },
  kasia: { name: "Kasia Lewandowska", activeCommunity: "krakow", createdDaysAgo: 50 },
  carlo: { name: "Carlo Reyes", activeCommunity: "manila", createdDaysAgo: 210 },
  bea: { name: "Bea Santos", activeCommunity: "manila", createdDaysAgo: 200 },
  paolo: { name: "Paolo Mendoza", activeCommunity: "manila", createdDaysAgo: 61 },
  angelica: { name: "Angelica Cruz", activeCommunity: "manila", createdDaysAgo: 61 },
  jericho: { name: "Jericho Villanueva", activeCommunity: "manila", createdDaysAgo: 61 },
  katrina: { name: "Katrina Lim", activeCommunity: "manila", createdDaysAgo: 33 },
  migueltan: { name: "Miguel Tan", activeCommunity: "manila", createdDaysAgo: 33 },
  rhea: { name: "Rhea Domingo", activeCommunity: "manila", createdDaysAgo: 14 },
  nico: { name: "Nico Bautista", activeCommunity: "manila", createdDaysAgo: 14 },
  joy: { name: "Joy Ramos", activeCommunity: "manila", createdDaysAgo: 4 },
  daniel: { name: "Daniel Mensah", createdDaysAgo: 3 },
};

const lagosReport = {
  format: "irl",
  focus: "crypto",
  audiences: ["developers", "general"],
} as const;

export const DEMO_COMMUNITIES: Record<DemoCommunityKey, DemoCommunity> = {
  lagos: {
    name: "Lagos City Node",
    nodeName: "Lagos",
    slug: "lagos-demo",
    timezone: "Africa/Lagos",
    utcHour: 16,
    latitude: 6.5244,
    longitude: 3.3792,
    createdDaysAgo: 330,
    activatedDaysAgo: 300,
    profile: {
      summary:
        "Builders, students and small businesses in Lagos meeting every other Saturday to ship on NEAR and keep our validator online.",
      location: "Lagos",
      region: "Lagos State, Nigeria",
      published: true,
      channels: [
        { label: "Telegram", url: "https://t.me/citynode_lagos_demo" },
        { label: "X", url: "https://x.com/citynode_lagos_demo" },
      ],
    },
    validator: "lagos.pool.f863973.m0",
    bulletin:
      "Demo Day is on the 22nd at the Yaba hub. Bring a laptop and something you built this month.",
    people: [
      { person: "adaeze", role: "owner", joinedDaysAgo: 300, directory: true },
      { person: "tunde", role: "member", teams: ["Events"], joinedDaysAgo: 290, directory: true },
      { person: "ifeoma", role: "member", teams: ["Treasury"], joinedDaysAgo: 285 },
      { person: "chidi", role: "member", directory: true },
      { person: "kemi", role: "member", directory: true },
      { person: "emeka", role: "member" },
      { person: "funmi", role: "member", directory: true },
      { person: "segun", role: "member" },
      { person: "zainab", role: "member" },
      { person: "olumide", role: "member" },
      { person: "ngozi", role: "member" },
      { person: "yusuf", role: "member" },
      { person: "sofia", role: "member" },
      { person: "amara", role: "member" },
      { person: "bolaji", role: "member" },
      { person: "tobi", role: "member" },
      { person: "halima", role: "member" },
      { person: "precious", role: "member" },
    ],
    teamRequests: [{ person: "chidi", team: "Events", daysAgo: 2 }],
    events: [
      {
        key: "launch",
        title: "Lagos City Node Launch Night",
        summary: "Meet the people running Lagos's validator and hear what we plan for the year.",
        venue: "CcHub, Yaba",
        day: -81,
        attendees: ["chidi", "zainab", "olumide", "kemi"],
        report: {
          ...lagosReport,
          submittedDaysAfter: 1,
          by: "tunde",
          audiences: ["general", "smb"],
          theme: "Launching the Lagos City Node and its validator",
          attendees: 46,
          kpis: ["46 people checked in", "4 joined the community on the night", ""],
          wentWell:
            "Strong turnout from small business owners; the live staking demo kept people in the room.",
          improvements: "Check-in queue was slow; we need a second phone running the station.",
          nextActions: "Run a hands-on wallet session for the people who asked for one.",
          partners: "CcHub",
        },
      },
      {
        key: "wallets",
        title: "Builders Breakfast: Wallets in Naira",
        summary: "Morning session on on-ramps, naira pricing and wallet UX for first-time users.",
        venue: "CcHub, Yaba",
        day: -67,
        hours: 2,
        attendees: ["chidi", "kemi", "emeka", "funmi"],
        report: {
          ...lagosReport,
          submittedDaysAfter: 2,
          by: "tunde",
          theme: "Wallet onboarding for first-time users in Nigeria",
          attendees: 28,
          kpis: ["28 attendees", "12 new wallets created", "2 joined the community"],
          wentWell: "Pairing newcomers with a builder meant everyone left with a working wallet.",
          improvements: "Breakfast ran late; start 30 minutes earlier next time.",
          nextActions: "Publish the wallet checklist we used and share it on Telegram.",
        },
      },
      {
        key: "workshop",
        title: "NEAR Workshop at Yaba Tech Hub",
        summary: "Hands-on smart contract workshop for students and junior developers.",
        venue: "Yaba Tech Hub",
        day: -53,
        hours: 4,
        attendees: ["chidi", "emeka", "segun", "ngozi", "zainab"],
        report: {
          ...lagosReport,
          submittedDaysAfter: 1,
          by: "tunde",
          audiences: ["developers", "academic"],
          theme: "Writing and deploying a first NEAR contract",
          attendees: 34,
          kpis: ["34 attendees", "19 contracts deployed to testnet", "2 joined the community"],
          wentWell: "Students finished the exercise; three asked to mentor at the next workshop.",
          improvements: "Power cut for 40 minutes. Book a venue with a generator.",
          nextActions: "Start a fortnightly study group for the students who finished.",
          partners: "Yaba College of Technology computer society",
        },
      },
      {
        key: "validator-night",
        title: "Validator Night: How Our Node Stays Online",
        summary: "A walk through our validator setup, uptime and what staking pays for.",
        venue: "The Workstation, Victoria Island",
        day: -39,
        attendees: ["chidi", "funmi", "yusuf", "olumide", "kemi"],
        report: {
          ...lagosReport,
          submittedDaysAfter: 3,
          by: "adaeze",
          audiences: ["general", "smb"],
          theme: "Explaining the city validator and community staking",
          attendees: 31,
          kpis: ["31 attendees", "6 people staked with the city node", "1 joined the community"],
          wentWell: "The uptime dashboard on the big screen answered most questions on its own.",
          improvements: "Too much jargon in the first half; open with what staking pays for.",
          nextActions: "Write a one-page explainer on staking for the community channel.",
        },
      },
      {
        key: "agents",
        title: "AI Agents Meetup",
        summary: "Lightning talks on AI agents that hold keys and pay for things on NEAR.",
        venue: "CcHub, Yaba",
        day: -25,
        attendees: ["chidi", "emeka", "sofia", "ngozi", "amara", "bolaji"],
        report: {
          ...lagosReport,
          submittedDaysAfter: 12,
          by: "tunde",
          focus: "ai",
          theme: "AI agents that act on-chain",
          attendees: 52,
          kpis: ["52 attendees", "5 lightning talks", "3 joined the community"],
          wentWell: "Best attended event this quarter; talks were short and practical.",
          improvements: "Report was late: we lost the attendee photos for a week.",
          nextActions: "Invite two speakers back for a longer agents workshop in December.",
          insights: "Most questions were about keeping agent keys safe, not about models.",
        },
      },
      {
        key: "campus-tour",
        title: "Campus Tour: University of Lagos",
        summary: "Visit to the UNILAG computer science society.",
        venue: "University of Lagos, Akoka",
        day: -18,
        status: "cancelled",
      },
      {
        key: "payments-hack",
        title: "Hack Afternoon: Payments",
        summary: "Build a payment link or checkout on NEAR in one afternoon.",
        venue: "CcHub, Yaba",
        day: -11,
        hours: 5,
        attendees: ["chidi", "segun", "funmi", "bolaji", "tobi", "halima"],
      },
      {
        key: "community-call",
        title: "Community Call: November Plans",
        summary: "Open call to plan Demo Day and the year-end social.",
        venue: "Online",
        day: -4,
        hours: 1,
        attendees: ["kemi", "yusuf", "tobi", "chidi", "precious"],
      },
      {
        key: "stablecoins",
        title: "Builders Breakfast: Stablecoins",
        summary: "How Lagos businesses are using stablecoins for supplier payments.",
        venue: "CcHub, Yaba",
        day: 3,
        hours: 2,
      },
      {
        key: "demo-day",
        title: "Lagos Demo Day",
        summary: "Show what you built this autumn. Five-minute demos, open to everyone.",
        venue: "Yaba Tech Hub",
        day: 10,
        hours: 4,
      },
      {
        key: "year-end",
        title: "Year-End Social",
        summary: "Food, music and the year's highlights.",
        venue: "Terra Kulture, Victoria Island",
        day: 24,
      },
    ],
  },
  lisbon: {
    name: "Lisbon City Node",
    nodeName: "Lisbon",
    slug: "lisbon-demo",
    timezone: "Europe/Lisbon",
    utcHour: 18,
    latitude: 38.7223,
    longitude: -9.1393,
    createdDaysAgo: 365,
    activatedDaysAgo: 350,
    profile: {
      summary:
        "Monthly meetups, student workshops and a founders' coffee for people building on NEAR in Lisbon.",
      location: "Lisbon",
      region: "Lisbon, Portugal",
      published: true,
      channels: [
        { label: "Telegram", url: "https://t.me/citynode_lisbon_demo" },
        { label: "Meetup", url: "https://www.meetup.com/citynode-lisbon-demo" },
      ],
    },
    validator: "lisbon.pool.f863973.m0",
    people: [
      { person: "ines", role: "owner", joinedDaysAgo: 350, directory: true },
      { person: "rui", role: "member", teams: ["Events"], joinedDaysAgo: 340, directory: true },
      { person: "beatriz", role: "member", teams: ["Treasury"], joinedDaysAgo: 330 },
      { person: "rita", role: "member", joinedDaysAgo: 90 },
      { person: "sofia", role: "member", directory: true },
      { person: "tiago", role: "member", directory: true },
      { person: "marta", role: "member" },
      { person: "joao", role: "member" },
      { person: "ana", role: "member" },
      { person: "miguel", role: "member" },
      { person: "carolina", role: "member" },
      { person: "duarte", role: "member" },
      { person: "leonor", role: "member" },
      { person: "filipa", role: "member" },
    ],
    events: [
      {
        key: "meetup-14",
        title: "Web3 Lisboa Meetup #14",
        summary: "Two talks and drinks: account abstraction and chain signatures.",
        venue: "Second Home, Mercado da Ribeira",
        day: -62,
        attendees: ["tiago", "marta", "joao", "sofia"],
        report: {
          format: "irl",
          focus: "crypto",
          audiences: ["developers", "general"],
          submittedDaysAfter: 2,
          by: "rui",
          theme: "Account abstraction and chain signatures in practice",
          attendees: 38,
          kpis: ["38 attendees", "2 talks", "4 joined the community"],
          wentWell: "Good mix of developers and curious newcomers; the Q&A ran 40 minutes.",
          improvements: "Sound was poor at the back of the room.",
          nextActions: "Record the next talks and post them in the channel.",
          partners: "Second Home",
        },
      },
      {
        key: "ist-students",
        title: "Intro to NEAR for Students at IST",
        summary: "A first look at NEAR for computer science students at Técnico.",
        venue: "Instituto Superior Técnico, Alameda",
        day: -48,
        hours: 2,
        attendees: ["tiago", "ana", "miguel"],
        report: {
          format: "irl",
          focus: "crypto",
          audiences: ["academic", "developers"],
          submittedDaysAfter: 16,
          by: "rui",
          theme: "Getting students from zero to a deployed contract",
          attendees: 41,
          kpis: ["41 students", "2 joined the community", "1 thesis topic proposed"],
          wentWell: "The student association promoted it well; the room was full.",
          improvements: "Too much content for two hours; split it into two sessions.",
          nextActions: "Set up a follow-up workshop with the student association in January.",
          partners: "NEIIST student association",
        },
      },
      {
        key: "founders-coffee",
        title: "Founders Coffee, Cais do Sodré",
        summary: "Informal coffee for founders building or considering building on NEAR.",
        venue: "Dear Breakfast, Cais do Sodré",
        day: -34,
        hours: 2,
        attendees: ["marta", "carolina", "joao"],
      },
      {
        key: "privacy-panel",
        title: "Privacy & AI Panel",
        summary: "Panel on private inference, agents and what they need from a chain.",
        venue: "Unicorn Factory Lisboa, Beato",
        day: -20,
        attendees: ["tiago", "sofia", "carolina", "duarte", "leonor"],
        report: {
          format: "irl",
          focus: "ai",
          audiences: ["developers", "smb"],
          submittedDaysAfter: 1,
          by: "ines",
          theme: "Private AI and on-chain agents",
          attendees: 57,
          kpis: ["57 attendees", "3 panelists", "2 joined the community"],
          wentWell: "Panelists disagreed in a useful way; people stayed long after.",
          improvements: "We ran out of check-in codes and had to make a second one.",
          nextActions: "Turn the panel notes into a short article for the community page.",
          partners: "Unicorn Factory Lisboa",
        },
      },
      {
        key: "meetup-15",
        title: "Web3 Lisboa Meetup #15",
        summary: "Monthly meetup: wallets for normal people, and a live demo.",
        venue: "Second Home, Mercado da Ribeira",
        day: -6,
        attendees: ["tiago", "marta", "ana", "filipa"],
      },
      {
        key: "validator-workshop",
        title: "Validator Workshop",
        summary: "How the Lisbon node runs, and how to help operate it.",
        venue: "LACS Anjos",
        day: 8,
        hours: 3,
      },
      {
        key: "hackathon-kickoff",
        title: "Winter Hackathon Kickoff",
        summary: "Team formation and themes for the December hackathon.",
        venue: "Unicorn Factory Lisboa, Beato",
        day: 15,
      },
    ],
  },
  nairobi: {
    name: "Nairobi City Node",
    nodeName: "Nairobi",
    slug: "nairobi-demo",
    timezone: "Africa/Nairobi",
    utcHour: 14,
    latitude: -1.2921,
    longitude: 36.8219,
    createdDaysAgo: 12,
    activatedDaysAgo: 9,
    profile: null,
    validator: null,
    people: [
      { person: "wanjiru", role: "owner", joinedDaysAgo: 9 },
      { person: "nadia", role: "admin", joinedDaysAgo: 9 },
      { person: "otieno", role: "member", joinedDaysAgo: 5 },
    ],
    events: [],
  },
  "buenos-aires": {
    name: "Buenos Aires City Node",
    nodeName: "Buenos Aires",
    slug: "buenos-aires-demo",
    timezone: "America/Argentina/Buenos_Aires",
    utcHour: 21,
    latitude: -34.6037,
    longitude: -58.3816,
    createdDaysAgo: 24,
    activatedDaysAgo: 20,
    profile: {
      summary: "",
      location: "Buenos Aires",
      region: "Buenos Aires, Argentina",
      published: true,
      channels: [],
    },
    validator: null,
    people: [
      { person: "martin", role: "owner", joinedDaysAgo: 20 },
      { person: "lucia", role: "member", teams: ["Events"], joinedDaysAgo: 19 },
      { person: "santiago", role: "member", joinedDaysAgo: 15 },
      { person: "valentina", role: "member", joinedDaysAgo: 10 },
    ],
    events: [
      {
        key: "first-meetup",
        title: "Primer Meetup NEAR Buenos Aires",
        summary: "Our first meetup: who we are and what we want to build in the city.",
        venue: "Área Tres, Palermo",
        day: -7,
      },
      {
        key: "palermo-workshop",
        title: "Taller: Tu primera dApp",
        summary: "Hands-on workshop to build and deploy a first app on NEAR.",
        venue: "Área Tres, Palermo",
        day: 14,
        hours: 3,
      },
    ],
  },
  krakow: {
    name: "Kraków City Node",
    nodeName: "Kraków",
    slug: "krakow-demo",
    timezone: "Europe/Warsaw",
    utcHour: 17,
    latitude: 50.0647,
    longitude: 19.945,
    createdDaysAgo: 260,
    activatedDaysAgo: 240,
    profile: {
      summary: "Developers in Kraków meeting around Rust, NEAR and the city's validator.",
      location: "Kraków",
      region: "Lesser Poland, Poland",
      published: true,
      channels: [{ label: "Discord", url: "https://discord.gg/citynode-krakow-demo" }],
    },
    validator: null,
    people: [
      { person: "piotr", role: "owner", joinedDaysAgo: 240, directory: true },
      { person: "agnieszka", role: "member" },
      { person: "tomasz", role: "member" },
      { person: "kasia", role: "member" },
    ],
    events: [
      {
        key: "blockchain-evening",
        title: "Kraków Blockchain Evening",
        summary: "Talks and pierogi: what's new on NEAR this autumn.",
        venue: "Hub:Raum, Kazimierz",
        day: -63,
        attendees: ["agnieszka", "tomasz"],
        report: {
          format: "irl",
          focus: "crypto",
          audiences: ["developers"],
          submittedDaysAfter: 2,
          by: "piotr",
          theme: "What's new on NEAR this autumn",
          attendees: 18,
          kpis: ["18 attendees", "2 joined the community", ""],
          wentWell: "Relaxed format; people stayed to talk.",
          improvements: "Promote earlier, most people heard about it the same day.",
          nextActions: "Run a hands-on Rust workshop.",
        },
      },
      {
        key: "rust-workshop",
        title: "Rust & NEAR Workshop",
        summary: "Write a NEAR contract in Rust, from setup to tests.",
        venue: "Hub:Raum, Kazimierz",
        day: -49,
        hours: 4,
        attendees: ["agnieszka", "kasia"],
        report: {
          format: "irl",
          focus: "crypto",
          audiences: ["developers"],
          submittedDaysAfter: 9,
          by: "piotr",
          theme: "Smart contracts in Rust",
          attendees: 11,
          kpis: ["11 attendees", "8 finished the exercise", "1 joined the community"],
          wentWell: "Small group meant everyone got help.",
          improvements: "Setup took an hour; send install steps beforehand.",
          nextActions: "Find a co-organizer so events can continue while I travel.",
        },
      },
    ],
  },
  manila: {
    name: "Manila City Node",
    nodeName: "Manila",
    slug: "manila-demo",
    timezone: "Asia/Manila",
    utcHour: 10,
    latitude: 14.5995,
    longitude: 120.9842,
    createdDaysAgo: 215,
    activatedDaysAgo: 200,
    profile: {
      summary: "NEAR builders in Metro Manila: meetups in Makati and BGC, and campus caravans.",
      location: "Manila",
      region: "Metro Manila, Philippines",
      published: true,
      channels: [
        { label: "Facebook", url: "https://www.facebook.com/groups/citynode-manila-demo" },
      ],
    },
    validator: "manila.pool.f863973.m0",
    people: [
      { person: "carlo", role: "owner", joinedDaysAgo: 200, directory: true },
      { person: "bea", role: "member", teams: ["Events"], joinedDaysAgo: 195 },
      { person: "paolo", role: "member" },
      { person: "angelica", role: "member" },
      { person: "jericho", role: "member" },
      { person: "katrina", role: "member" },
      { person: "migueltan", role: "member" },
      { person: "rhea", role: "member" },
      { person: "nico", role: "member" },
      { person: "joy", role: "member" },
    ],
    events: [
      {
        key: "makati-meetup",
        title: "NEAR PH Meetup: Makati",
        summary: "Quarterly meetup for builders in Metro Manila.",
        venue: "Impact Hub Manila, Makati",
        day: -60,
        attendees: ["paolo", "angelica", "jericho"],
      },
      {
        key: "developer-night",
        title: "Developer Night BGC",
        summary: "Bring your laptop: pair on contracts and frontends.",
        venue: "The Mind Museum, BGC",
        day: -32,
        attendees: ["paolo", "katrina", "migueltan"],
      },
      {
        key: "campus-caravan",
        title: "Campus Caravan: UP Diliman",
        summary: "Talk and workshop with the UP computer science society.",
        venue: "University of the Philippines Diliman",
        day: -13,
        hours: 4,
        attendees: ["angelica", "katrina", "rhea", "nico"],
      },
      {
        key: "ai-mixer",
        title: "AI x Web3 Mixer",
        summary: "Short demos of AI agents on NEAR, then drinks.",
        venue: "Impact Hub Manila, Makati",
        day: -3,
        attendees: ["paolo", "jericho", "nico", "joy"],
      },
      {
        key: "builders-saturday",
        title: "Builders Saturday",
        summary: "A day of building with mentors on call.",
        venue: "Impact Hub Manila, Makati",
        day: 9,
        hours: 6,
      },
    ],
  },
};

export const DEMO_PROPOSALS: DemoProposal[] = [
  {
    key: "accra",
    name: "Accra",
    slug: "accra-demo",
    motivation:
      "We run a monthly developer meetup at a coworking space in Osu and want to run the city's validator together.",
    submitter: "kwame.demo.citynode.testnet",
    daysAgo: 2,
    reviewStatus: "pending",
    applyStatus: "not_started",
  },
  {
    key: "cape-town",
    name: "Cape Town",
    slug: "cape-town-demo",
    motivation:
      "Students from UCT and builders from the Woodstock coworking spaces meeting every month.",
    submitter: "thandi.demo.citynode.testnet",
    daysAgo: 15,
    reviewStatus: "approved",
    applyStatus: "failed",
    applyError: "The community account could not be created: the DAO factory call ran out of gas.",
  },
];

export const DEMO_PERSONAS = {
  platformAdmin: "nadia",
  ownerMature: "adaeze",
  organizer: "tunde",
  finance: "ifeoma",
  member: "chidi",
  twoCommunities: "sofia",
  noCommunity: "daniel",
  ownerSecondMature: "ines",
  ownerNew: "wanjiru",
  ownerNewWithEvents: "martin",
  ownerQuiet: "piotr",
  ownerNoReports: "carlo",
} as const satisfies Record<string, DemoPersonKey>;

export type DemoPersona = keyof typeof DEMO_PERSONAS;
