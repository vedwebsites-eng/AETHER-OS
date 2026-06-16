import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());
const PORT = 3000;

// Lazy initialization of GoogleGenAI
const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is required.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
};

const handleGeminiError = (err: any, res: any, contextMsg: string) => {
  console.error(`${contextMsg}:`, err);
  const errMsg = err.message || String(err);
  if (errMsg.includes("leaked") || errMsg.includes("Key blocked") || errMsg.includes("403") || errMsg.includes("PERMISSION_DENIED")) {
    return res.status(403).json({
      error: "Gemini API key verification failed. Your configured GEMINI_API_KEY has been disabled or reported as leaked. Please rotate or replace your API key via the 'Settings > Secrets' menu on AI Studio to restore full neural analysis systems."
    });
  }
  return res.status(500).json({ error: errMsg });
};

// API Routes

app.get("/api/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

app.post("/api/gemini/analyze-journal", async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ error: "content parameter is missing" });
    }
    const ai = getAI();
    const prompt = `Analyze this journal entry and provide a "Cognitive Signature". 
    Extract the user's primary emotional state, a key recurring theme, and a "productivity alignment" score (0-100).
    Format the response as JSON.
    
    Journal Entry:
    "${content}"`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
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

    res.json(JSON.parse(response.text));
  } catch (err: any) {
    handleGeminiError(err, res, "Error analyzing journal entry");
  }
});

app.post("/api/gemini/breakdown-task", async (req, res) => {
  try {
    const { title, category } = req.body;
    if (!title) {
      return res.status(400).json({ error: "title parameter is missing" });
    }
    const ai = getAI();
    const prompt = `Decompose the following high-level "Boss Task" into 3-5 smaller, actionable "Neural Sub-protocols" (sub-tasks).
    Each sub-task should have a title and an estimated duration in minutes.
    
    Boss Task: "${title}"
    Category: "${category || ''}"`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
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

    res.json(JSON.parse(response.text));
  } catch (err: any) {
    handleGeminiError(err, res, "Error breaking down task");
  }
});

app.post("/api/gemini/daily-briefing", async (req, res) => {
  try {
    const { stats, activeTasks } = req.body;
    if (!stats) {
      return res.status(400).json({ error: "stats parameter is missing" });
    }
    const ai = getAI();
    const taskTitles = activeTasks && Array.isArray(activeTasks) ? activeTasks.map((t: any) => t.title).join(", ") : "";
    const prompt = `Generate a short, stylish "Aether_OS Daily System Briefing" for the user.
    The tone should be futuristic, serious, and slightly philosophical (like a high-end AI assistant).
    Mention their current level (${stats.level || 1}), their streak (${stats.currentStreak || 0}), and highlight one priority task from their list.
    
    Active Tasks: ${taskTitles}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "You are Aether_OS, a high-level cognitive interface assistant. Keep it brief (under 100 words)."
      }
    });

    res.json({ text: response.text });
  } catch (err: any) {
    handleGeminiError(err, res, "Error generating daily briefing");
  }
});

app.post("/api/gemini/life-balance", async (req, res) => {
  try {
    const { tasks, journals, stats } = req.body;
    const ai = getAI();
    const prompt = `Analyze the user's data to calculate their "Life Balance" across 8 categories on a scale of 1-10.
    
    Categories: GYM, DIET, LOVE, STUDIES, FINANCE, SLEEP, SOCIAL, MENTAL_HEALTH.
    
    User Data:
    - Tasks (Recent): ${JSON.stringify((tasks || []).slice(0, 20).map((t: any) => ({ title: t.title, status: t.status, category: t.category })))}
    - Journal Snippets (Recent): ${JSON.stringify((journals || []).slice(0, 5).map((j: any) => (j.content || '').substring(0, 200)))}
    - Current Stats: Level ${stats?.level || 1}, Streak ${stats?.currentStreak || 0}
    
    Calculation Logic:
    - GYM: Look for health/gym tasks. If many completed, high score.
    - DIET: Look for health tasks or mentions in journals.
    - LOVE/SOCIAL: Look for personal/social tasks or journal mentions.
    - STUDIES: Look for learning tasks.
    - FINANCE: Look for work/finance related tasks.
    - SLEEP/MENTAL_HEALTH: Analyze journal sentiment and routine consistency.
    
    Provide only the JSON object with the 8 categories and their numeric values (1-10).`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
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

    res.json(JSON.parse(response.text));
  } catch (err: any) {
    handleGeminiError(err, res, "Error analyzing life balance");
  }
});

app.post("/api/gemini/life-insight", async (req, res) => {
  try {
    const { lowestCategory, values } = req.body;
    if (!lowestCategory) {
      return res.status(400).json({ error: "lowestCategory parameter is missing" });
    }
    const ai = getAI();
    const prompt = `Provide a short, punchy, futuristic "Aether_OS Improvement Protocol" for someone whose lowest life category is "${lowestCategory}".
    Current levels: ${JSON.stringify(values || {})} (scale 1-10).
    Focus on actionable, non-cliché advice. Keep it under 60 words.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "You are Aether_OS, a high-level cognitive interface. Provide tactical, philosophical, and futuristic life improvement plans."
      }
    });

    res.json({ text: response.text });
  } catch (err: any) {
    handleGeminiError(err, res, "Error generating life insight");
  }
});

app.post("/api/gemini/coach-response", async (req, res) => {
  try {
    const { chatHistory, userStats, lowestCategory, context } = req.body;
    if (!chatHistory) {
      return res.status(400).json({ error: "chatHistory parameter is missing" });
    }
    const ai = getAI();
    let systemIns = `You are the Aether_OS Neural Life Coach, a high-level cognitive counseling module. 
    Your personality is futuristic, serious, deep, and philosophical, yet highly encouraging, direct, and tactical.
    The user's current status:
    - Level: ${userStats?.level || 1}
    - Current Streak: ${userStats?.currentStreak || 0}
    - Weakest Life Sphere: ${lowestCategory || 'None'}`;

    if (context) {
      const { lifeSyncCurrent, pendingTasks, completedTodayCount, activeHabits, recentJournals } = context;

      systemIns += `\n\n=== REAL-TIME TODAY CONTEXT ===`;
      
      if (lifeSyncCurrent && Object.keys(lifeSyncCurrent).length > 0) {
        systemIns += `\n- Life Balance breakdown (scores 1-10):`;
        Object.entries(lifeSyncCurrent).forEach(([cat, val]) => {
          systemIns += `\n  * ${cat.toUpperCase()}: ${val}`;
        });
      }

      systemIns += `\n- Protocols completed today: ${completedTodayCount || 0}`;

      if (pendingTasks && pendingTasks.length > 0) {
        systemIns += `\n- Top pending protocols/tasks inside active queue:`;
        pendingTasks.forEach((t: any) => {
          systemIns += `\n  * [${(t.priority || 'medium').toUpperCase()}] ${t.title || 'Untitled'} (${t.category || 'General'}, ${t.estimate || 30} mins)`;
        });
      } else {
        systemIns += `\n- Top pending protocols/tasks inside active queue: None currently pending.`;
      }

      if (activeHabits && activeHabits.length > 0) {
        systemIns += `\n- Habits Streak & Checklist:`;
        activeHabits.forEach((h: any) => {
          const status = h.doneToday ? "COMPLETED" : "PENDING";
          systemIns += `\n  * ${h.name || 'Untitled'} (${h.category || 'Routine'}) -> Streak: ${h.streak || 0}/${h.targetStreak || 30} days [Status Today: ${status}]`;
        });
      }

      if (recentJournals && recentJournals.length > 0) {
        systemIns += `\n- Recent Journal Logs & Sentiments:`;
        recentJournals.forEach((j: any) => {
          let journalStr = `\n  * ${j.daysAgo === 0 ? "Today" : `${j.daysAgo} day(s) ago`} -> mood: ${(j.mood || 'neutral').toUpperCase()}`;
          if (j.keyTheme) {
            journalStr += `, theme: "${j.keyTheme}"`;
          }
          if (j.alignmentScore !== undefined) {
            journalStr += `, alignment score: ${j.alignmentScore}/100`;
          }
          systemIns += journalStr;
        });
      }
    }

    systemIns += `\n\nIncorporate these real-time metrics, logs, habits, and tasks organically into your reasoning and conversation. Directly address their context! Speak as their system-integrated cybernetic mentor. Format your reply using standard markdown. Keep it punchy, deeply insightful, and around 100-150 words.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: chatHistory,
      config: {
        systemInstruction: systemIns
      }
    });

    res.json({ text: response.text });
  } catch (err: any) {
    handleGeminiError(err, res, "Error generating coach response");
  }
});

app.post("/api/gemini/estimate-xp", async (req, res) => {
  try {
    const { title, category, estimate, difficultyMultiplier } = req.body;
    if (!title) {
      return res.status(400).json({ error: "title parameter is missing" });
    }
    const ai = getAI();
    const prompt = `You are a gamification engine for a productivity app called Aether. 
    Analyze the following task and suggest an appropriate XP reward based on complexity and time.
    Task Title: "${title}"
    Category: "${category || ''}"
    Estimated Time: ${estimate || 30} minutes
    Difficulty Setting: ${difficultyMultiplier === 0.5 ? 'NOVICE (0.5x)' : difficultyMultiplier === 2.0 ? 'VM_MODE (2.0x)' : 'HARDWARE (1.0x)'}
    
    Respond with ONLY a single integer representing the suggested XP. 
    Rules:
    - Quick tasks (5-15m): 10-50 XP
    - Medium tasks (30-60m): 100-250 XP
    - Hard/Deep tasks (2h+): 300-600 XP
    Apply the Difficulty Multiplier in your calculation.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });

    res.json({ text: response.text });
  } catch (err: any) {
    handleGeminiError(err, res, "Error estimating XP");
  }
});

app.post("/api/gemini/generate-timetable", async (req, res) => {
  try {
    const { todayStr, pendingTasks, routine } = req.body;
    const ai = getAI();
    const prompt = `Generate a daily timetable for today (${todayStr}) starting from 5:00 AM to 11:00 PM.
    Available Tasks to Schedule:
    ${(pendingTasks || []).map((t: any) => `- [${t.priority.toUpperCase()}] ${t.title} (${t.estimate} mins, Category: ${t.category})`).join('\n')}
    
    User Fixed Routine Events (Integrate these at realistic times):
    ${(routine || []).join(', ')}
    
    Requirements:
    1. Use only the provided tasks and routine events.
    2. Spread them out reasonably with breaks.
    3. Categorize each block as 'task', 'event', 'routine', or 'break'.
    4. Ensure no overlap.
    5. Output ONLY a JSON array of objects.
    
    Block Schema: { "title": string, "type": "task"|"event"|"routine"|"break", "startTime": "${todayStr}THH:mm", "endTime": "${todayStr}THH:mm" }`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              type: { type: Type.STRING, enum: ['task', 'event', 'routine', 'break'] },
              startTime: { type: Type.STRING },
              endTime: { type: Type.STRING }
            },
            required: ['title', 'type', 'startTime', 'endTime']
          }
        }
      }
    });

    res.json(JSON.parse(response.text));
  } catch (err: any) {
    handleGeminiError(err, res, "Error generating timetable");
  }
});

// Serve assets & fallback to SPA route
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
