const STORAGE_KEY = "zulu-bloom-pairs";
const STREAK_KEY = "zulu-bloom-streak";

const DAYS_MODULE_PAIRS = [
  { english: "Monday = UMsombuluko", zulu: "UMsombuluko ngisebenza ekhaya. (On Monday I work from home.)" },
  { english: "Tuesday = ULwesibili", zulu: "ULwesibili sifunda isiZulu ndawonye. (On Tuesday we study Zulu together.)" },
  { english: "Wednesday = ULwesithathu", zulu: "ULwesithathu ngivakashela umngani wami. (On Wednesday I visit my friend.)" },
  { english: "Thursday = ULwesine", zulu: "ULwesine ngipheka ukudla kwakusihlwa. (On Thursday I cook dinner.)" },
  { english: "Friday = ULwesihlanu", zulu: "ULwesihlanu siyadlala ngemuva komsebenzi. (On Friday we play after work.)" },
  { english: "Saturday = UMgqibelo", zulu: "UMgqibelo siya emakethe ekuseni. (On Saturday we go to the market in the morning.)" },
  { english: "Sunday = ISonto", zulu: "ISonto ngiyaphumula nomndeni wami. (On Sunday I rest with my family.)" },
];

const state = {
  pairs: [],
  sessionQueue: [],
  currentCard: null,
  reviewedCount: 0,
};

const elements = {
  progressFill: document.getElementById("progressFill"),
  progressLabel: document.getElementById("progressLabel"),
  sessionLabel: document.getElementById("sessionLabel"),
  cardTag: document.getElementById("cardTag"),
  cardPrompt: document.getElementById("cardPrompt"),
  cardAnswer: document.getElementById("cardAnswer"),
  revealButton: document.getElementById("revealButton"),
  againButton: document.getElementById("againButton"),
  goodButton: document.getElementById("goodButton"),
  nextButton: document.getElementById("nextButton"),
  pairForm: document.getElementById("pairForm"),
  englishInput: document.getElementById("englishInput"),
  zuluInput: document.getElementById("zuluInput"),
  pairList: document.getElementById("pairList"),
  bulkInput: document.getElementById("bulkInput"),
  bulkAddButton: document.getElementById("bulkAddButton"),
  exportButton: document.getElementById("exportButton"),
  exportStatus: document.getElementById("exportStatus"),
  streakValue: document.getElementById("streakValue"),
  loadDaysModuleButton: document.getElementById("loadDaysModuleButton"),
  moduleStatus: document.getElementById("moduleStatus"),
};

const todayISO = () => new Date().toISOString().split("T")[0];

const fetchDefaultPairs = async () => {
  try {
    const response = await fetch("data/zulu-english-pairs.json", {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Failed to load defaults: ${response.status}`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error("Default pairs must be an array.");
    }
    return data
      .filter(
        (pair) =>
          pair &&
          typeof pair.english === "string" &&
          typeof pair.zulu === "string" &&
          pair.english.trim() &&
          pair.zulu.trim(),
      )
      .map((pair) => ({
        english: pair.english.trim(),
        zulu: pair.zulu.trim(),
      }));
  } catch (error) {
    console.warn("Unable to load default pairs.", error);
    return [];
  }
};

const loadPairs = async () => {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  const enriched = saved.map((pair) => ({
    ...pair,
    interval: pair.interval ?? 0,
    ease: pair.ease ?? 2.4,
    due: pair.due ?? Date.now(),
  }));

  const defaultPairs = await fetchDefaultPairs();
  const existingKeys = new Set(
    enriched.map((pair) => `${pair.english}|||${pair.zulu}`),
  );
  const seeded = defaultPairs
    .filter(
      (pair) => !existingKeys.has(`${pair.english}|||${pair.zulu}`),
    )
    .map((pair) => ({
      ...pair,
      id: crypto.randomUUID(),
      interval: 0,
      ease: 2.4,
      due: Date.now(),
      createdAt: Date.now(),
    }));

  state.pairs = [...enriched, ...seeded];
  persistPairs();
};

const persistPairs = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.pairs));
};

const loadStreak = () => {
  const streakData = JSON.parse(localStorage.getItem(STREAK_KEY) || "{}");
  return {
    count: streakData.count ?? 0,
    lastReviewDate: streakData.lastReviewDate ?? null,
  };
};

const saveStreak = (streak) => {
  localStorage.setItem(STREAK_KEY, JSON.stringify(streak));
};

const updateStreak = () => {
  const streak = loadStreak();
  const today = todayISO();

  if (streak.lastReviewDate === today) {
    return streak;
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayISO = yesterday.toISOString().split("T")[0];

  const newCount = streak.lastReviewDate === yesterdayISO ? streak.count + 1 : 1;
  const updated = { count: newCount, lastReviewDate: today };
  saveStreak(updated);
  return updated;
};

const renderStreak = () => {
  const streak = loadStreak();
  elements.streakValue.textContent = `${streak.count} day${streak.count === 1 ? "" : "s"}`;
};

const renderPairList = () => {
  elements.pairList.innerHTML = "";
  state.pairs.forEach((pair) => {
    const item = document.createElement("li");
    item.textContent = `${pair.english} = ${pair.zulu}`;
    elements.pairList.appendChild(item);
  });
};

const updateProgress = () => {
  const total = state.sessionQueue.length + (state.currentCard ? 1 : 0);
  const reviewed = state.reviewedCount;
  const progress = total === 0 ? 0 : Math.min((reviewed / total) * 100, 100);

  elements.progressFill.style.width = `${progress}%`;
  elements.progressLabel.textContent = `${reviewed} / ${total} reviewed`;
};

const setCardState = ({ tag, prompt, answer, showAnswer }) => {
  elements.cardTag.textContent = tag;
  elements.cardPrompt.textContent = prompt;
  elements.cardAnswer.textContent = showAnswer ? answer : "";
  elements.revealButton.disabled = showAnswer;
  elements.againButton.disabled = !showAnswer;
  elements.goodButton.disabled = !showAnswer;
};

const scheduleSession = () => {
  const now = Date.now();
  const due = state.pairs.filter((pair) => pair.due <= now);
  state.sessionQueue = [...due].sort((a, b) => a.due - b.due);
  state.reviewedCount = 0;
  updateProgress();

  if (state.sessionQueue.length === 0) {
    state.currentCard = null;
    elements.sessionLabel.textContent = "You are all caught up. Come back later!";
    setCardState({
      tag: "All done",
      prompt: "No cards due",
      answer: "",
      showAnswer: false,
    });
    elements.nextButton.textContent = "Refresh session";
    return;
  }

  elements.sessionLabel.textContent = "Your next review is ready.";
  elements.nextButton.textContent = "Next card";
  showNextCard();
};

const showNextCard = () => {
  const next = state.sessionQueue.shift();
  if (!next) {
    state.currentCard = null;
    updateProgress();
    elements.sessionLabel.textContent = "Session complete. Great work!";
    setCardState({
      tag: "Complete",
      prompt: "You cleared today's session",
      answer: "",
      showAnswer: false,
    });
    elements.nextButton.textContent = "Start new session";
    return;
  }

  state.currentCard = next;
  const tag = next.interval === 0 ? "New" : "Review";
  setCardState({
    tag,
    prompt: next.zulu,
    answer: next.english,
    showAnswer: false,
  });
  updateProgress();
};

const applyReview = (quality) => {
  if (!state.currentCard) return;

  const card = state.currentCard;
  let { interval, ease } = card;

  if (quality < 3) {
    interval = 0.5;
  } else if (interval === 0) {
    interval = 1;
  } else if (interval < 1) {
    interval = 1;
  } else {
    interval = Math.round(interval * ease);
  }

  const easeAdjustment = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
  ease = Math.max(1.3, ease + easeAdjustment);

  card.interval = interval;
  card.ease = ease;
  card.due = Date.now() + interval * 24 * 60 * 60 * 1000;
  card.lastReviewed = Date.now();

  state.reviewedCount += 1;
  persistPairs();
  updateProgress();

  updateStreak();
  renderStreak();

  showNextCard();
};

const handleReveal = () => {
  if (!state.currentCard) return;
  setCardState({
    tag: state.currentCard.interval === 0 ? "New" : "Review",
    prompt: state.currentCard.zulu,
    answer: state.currentCard.english,
    showAnswer: true,
  });
};

const createPair = (english, zulu) => ({
  id: crypto.randomUUID(),
  english,
  zulu,
  interval: 0,
  ease: 2.4,
  due: Date.now(),
  createdAt: Date.now(),
});

const addPair = (english, zulu) => {
  state.pairs.unshift(createPair(english, zulu));
  persistPairs();
  renderPairList();
  scheduleSession();
};

const addPairsBatch = (pairs) => {
  const existingKeys = new Set(
    state.pairs.map((pair) => `${pair.english}|||${pair.zulu}`),
  );

  const newPairs = pairs
    .filter(({ english, zulu }) => english && zulu)
    .filter(({ english, zulu }) => !existingKeys.has(`${english}|||${zulu}`))
    .map(({ english, zulu }) => createPair(english, zulu));

  if (newPairs.length === 0) {
    return 0;
  }

  state.pairs.unshift(...newPairs);
  persistPairs();
  renderPairList();
  scheduleSession();
  return newPairs.length;
};

const handleLoadDaysModule = () => {
  const addedCount = addPairsBatch(DAYS_MODULE_PAIRS);
  elements.moduleStatus.textContent =
    addedCount === 0
      ? "Days module already loaded. No new pairs were added."
      : `Added ${addedCount} day-of-the-week practice pair${addedCount === 1 ? "" : "s"}.`;
};

const handlePairSubmit = (event) => {
  event.preventDefault();
  const english = elements.englishInput.value.trim();
  const zulu = elements.zuluInput.value.trim();
  if (!english || !zulu) return;

  addPair(english, zulu);
  elements.englishInput.value = "";
  elements.zuluInput.value = "";
};

const handleBulkAdd = () => {
  const lines = elements.bulkInput.value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  lines.forEach((line) => {
    const [english, zulu] = line.split("=").map((part) => part.trim());
    if (english && zulu) {
      addPair(english, zulu);
    }
  });

  elements.bulkInput.value = "";
};

const getExportPairs = () =>
  state.pairs.map(({ english, zulu }) => ({
    english,
    zulu,
  }));

const handleExport = () => {
  const exportData = getExportPairs();
  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "zulu-english-pairs.json";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  elements.exportStatus.textContent = `Downloaded ${exportData.length} pair${
    exportData.length === 1 ? "" : "s"
  }.`;
};

const init = async () => {
  await loadPairs();
  renderPairList();
  renderStreak();
  scheduleSession();

  elements.revealButton.addEventListener("click", handleReveal);
  elements.againButton.addEventListener("click", () => applyReview(2));
  elements.goodButton.addEventListener("click", () => applyReview(4));
  elements.nextButton.addEventListener("click", scheduleSession);
  elements.pairForm.addEventListener("submit", handlePairSubmit);
  elements.bulkAddButton.addEventListener("click", handleBulkAdd);
  elements.exportButton.addEventListener("click", handleExport);
  elements.loadDaysModuleButton.addEventListener("click", handleLoadDaysModule);
};

init();
