export const analyzeJournalEntry = async (content: string) => {
  const response = await fetch("/api/gemini/analyze-journal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content })
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `HTTP error! status: ${response.status}`);
  }
  return response.json();
};

export const breakdownBossTask = async (taskTitle: string, category: string) => {
  const response = await fetch("/api/gemini/breakdown-task", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: taskTitle, category })
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `HTTP error! status: ${response.status}`);
  }
  return response.json();
};

export const generateDailyBriefing = async (stats: any, activeTasks: any[]) => {
  const response = await fetch("/api/gemini/daily-briefing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stats, activeTasks })
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `HTTP error! status: ${response.status}`);
  }
  const data = await response.json();
  return data.text;
};

export const analyzeLifeBalance = async (tasks: any[], journals: any[], stats: any) => {
  const response = await fetch("/api/gemini/life-balance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tasks, journals, stats })
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `HTTP error! status: ${response.status}`);
  }
  return response.json();
};

export const generateLifeInsight = async (lowestCategory: string, values: Record<string, number>) => {
  const response = await fetch("/api/gemini/life-insight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lowestCategory, values })
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `HTTP error! status: ${response.status}`);
  }
  const data = await response.json();
  return data.text;
};

export const generateCoachResponse = async (chatHistory: any[], userStats: any, lowestCategory: string) => {
  const response = await fetch("/api/gemini/coach-response", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatHistory, userStats, lowestCategory })
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `HTTP error! status: ${response.status}`);
  }
  const data = await response.json();
  return data.text;
};
