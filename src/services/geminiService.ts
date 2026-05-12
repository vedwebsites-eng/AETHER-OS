import { GoogleGenAI, Type } from "@google/genai";

const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY_NOT_FOUND");
  }
  return new GoogleGenAI({ apiKey });
};

export const analyzeJournalEntry = async (content: string) => {
  const ai = getAI();
  const prompt = `Analyze this journal entry and provide a "Cognitive Signature". 
  Extract the user's primary emotional state, a key recurring theme, and a "productivity alignment" score (0-100).
  Format the response as JSON.
  
  Journal Entry:
  "${content}"`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          emotionalState: { type: Type.STRING, description: "The primary emotion detected." },
          keyTheme: { type: Type.STRING, description: "The most important topic discussed." },
          alignmentScore: { type: Type.NUMBER, description: "Score from 0-100 representing how aligned the user feels with their goals." },
          insight: { type: Type.STRING, description: "A short, philosophical AI insight about their day." }
        },
        required: ["emotionalState", "keyTheme", "alignmentScore", "insight"]
      }
    }
  });

  return JSON.parse(response.text);
};

export const breakdownBossTask = async (taskTitle: string, category: string) => {
  const ai = getAI();
  const prompt = `Decompose the following high-level "Boss Task" into 3-5 smaller, actionable "Neural Sub-protocols" (sub-tasks).
  Each sub-task should have a title and an estimated duration in minutes.
  
  Boss Task: "${taskTitle}"
  Category: "${category}"`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            duration: { type: Type.NUMBER }
          },
          required: ["title", "duration"]
        }
      }
    }
  });

  return JSON.parse(response.text);
};

export const generateDailyBriefing = async (stats: any, activeTasks: any[]) => {
  const ai = getAI();
  const prompt = `Generate a short, stylish "Aether_OS Daily System Briefing" for the user.
  The tone should be futuristic, serious, and slightly philosophical (like a high-end AI assistant).
  Mention their current level (${stats.level}), their streak (${stats.currentStreak}), and highlight one priority task from their list.
  
  Active Tasks: ${activeTasks.map(t => t.title).join(", ")}`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      systemInstruction: "You are Aether_OS, a high-level cognitive interface assistant. Keep it brief (under 100 words)."
    }
  });

  return response.text;
};

export const analyzeLifeBalance = async (tasks: any[], journals: any[], stats: any) => {
  const ai = getAI();
  const prompt = `Analyze the user's data to calculate their "Life Balance" across 8 categories on a scale of 1-10.
  
  Categories: GYM, DIET, LOVE, STUDIES, FINANCE, SLEEP, SOCIAL, MENTAL_HEALTH.
  
  User Data:
  - Tasks (Recent): ${JSON.stringify(tasks.slice(0, 20).map(t => ({ title: t.title, status: t.status, category: t.category })))}
  - Journal Snippets (Recent): ${JSON.stringify(journals.slice(0, 5).map(j => j.content.substring(0, 200)))}
  - Current Stats: Level ${stats.level}, Streak ${stats.currentStreak}
  
  Calculation Logic:
  - GYM: Look for health/gym tasks. If many completed, high score.
  - DIET: Look for health tasks or mentions in journals.
  - LOVE/SOCIAL: Look for personal/social tasks or journal mentions.
  - STUDIES: Look for learning tasks.
  - FINANCE: Look for work/finance related tasks.
  - SLEEP/MENTAL_HEALTH: Analyze journal sentiment and routine consistency.
  
  Provide only the JSON object with the 8 categories and their numeric values (1-10).`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          GYM: { type: Type.NUMBER },
          DIET: { type: Type.NUMBER },
          LOVE: { type: Type.NUMBER },
          STUDIES: { type: Type.NUMBER },
          FINANCE: { type: Type.NUMBER },
          SLEEP: { type: Type.NUMBER },
          SOCIAL: { type: Type.NUMBER },
          MENTAL_HEALTH: { type: Type.NUMBER }
        },
        required: ["GYM", "DIET", "LOVE", "STUDIES", "FINANCE", "SLEEP", "SOCIAL", "MENTAL_HEALTH"]
      }
    }
  });

  return JSON.parse(response.text);
};

export const generateLifeInsight = async (lowestCategory: string, values: Record<string, number>) => {
  const ai = getAI();
  const prompt = `Provide a short, punchy, futuristic "Aether_OS Improvement Protocol" for someone whose lowest life category is "${lowestCategory}".
  Current levels: ${JSON.stringify(values)} (scale 1-10).
  Focus on actionable, non-cliché advice. Keep it under 60 words.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      systemInstruction: "You are Aether_OS, a high-level cognitive interface. Provide tactical, philosophical, and futuristic life improvement plans."
    }
  });

  return response.text;
};
