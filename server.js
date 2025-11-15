// 1. Load all our "engine parts"
const express = require("express");
const path = require("path");
const OpenAI = require("openai");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const session = require("express-session");
require("dotenv").config(); // Loads the API key from .env

// 2. Setup the Server
const app = express();
const port = 3000;

// Define environment mode and base URL
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const BASE_URL = IS_PRODUCTION
  ? process.env.LIVE_SITE_URL
  : `http://localhost:${port}`;

// 3. Middlewares
app.use(express.json()); // Parse JSON request bodies

// 4. Google OAuth & Session Configuration
if (IS_PRODUCTION) {
  // --- Production / Render Setup ---
  app.set("trust proxy", 1); 

  // Secure session setup for HTTPS
  app.use(
    session({
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: true,
      cookie: { secure: true, httpOnly: true, sameSite: "lax" },
    })
  );
  
  // Configure the Strategy using the LIVE_SITE_URL environment variable
  passport.use(
    new GoogleStrategy(
      { clientID: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${process.env.LIVE_SITE_URL}/auth/google/callback` },
      (accessToken, refreshToken, profile, done) => done(null, profile)
    )
  );
} else {
  // --- Localhost Development Setup ---
  
  // Insecure session setup for HTTP on localhost
  app.use(
    session({
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: true,
      cookie: { secure: false, httpOnly: true, sameSite: "lax" },
    })
  );

  // Configure the Strategy using the local BASE_URL variable
  passport.use(
    new GoogleStrategy(
      { clientID: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${BASE_URL}/auth/google/callback` },
      (accessToken, refreshToken, profile, done) => done(null, profile)
    )
  );
}

// Initialize Passport after session
app.use(passport.initialize());
app.use(passport.session());
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// 5. Setup OpenRouter AI client
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});


// CRITICAL: Array of Fallback Models (Using stable OpenRouter IDs)
const FALLBACK_MODELS = [
    // TIER 1: Best General Performance and Instruction Following (Standard OpenRouter ID)
    "openai/gpt-oss-20b:free",
    // TIER 2: Secondary Stable Model (Mistral is widely available)
    "mistralai/mistral-7b-instruct:free",
    // TIER 3: Highly Reliable Basic Backup (General GPT 3.5 clone)
    "openai/gpt-3.5-turbo",
];

// 6. Security Guard
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: "You must be logged in to do that." });
}

// MASTER FALLBACK FUNCTION: Tries models sequentially until one succeeds
async function runAiQuery(prompt) {
    const errorLog = [];
    
    for (const model of FALLBACK_MODELS) {
        try {
            console.log(`[AI] Attempting Model: ${model}`);
            
            const completion = await openai.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: model,
                temperature: 0.7, 
            });
            
            console.log(`[AI] Success using: ${model}`);
            return { success: true, content: completion.choices[0].message.content };
            
        } catch (error) {
            const status = error.status || "Unknown";
            const message = error.message || "Unknown error";
            
            if (status === 429) {
                console.warn(`[AI] RATE LIMIT HIT on ${model}. Trying next model...`);
                errorLog.push(`Rate Limit Hit on ${model}`);
                continue; // Move to the next model in the list
            } else if (status === 400 && message.includes("not a valid model ID")) {
                console.warn(`[AI] Model ${model} is invalid/unavailable. Trying next model...`);
                errorLog.push(`Invalid Model ID: ${model}`);
                continue;
            } else {
                console.error(`[AI] Critical failure on ${model}:`, error);
                errorLog.push(`Critical Error on ${model}: ${message}`);
                break; 
            }
        }
    }

    // If the loop finishes without success, return the final failure message
    return { 
        success: false, 
        content: `FATAL ERROR: All ${FALLBACK_MODELS.length} AI models failed. Please check OpenRouter credits. Log: ${errorLog.join(' / ')}` 
    };
}


// 7. Serve frontend HTML pages (standard)
app.use(express.static(__dirname));

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/app.html", (req, res) => res.sendFile(path.join(__dirname, "app.html")));
app.get("/contact.html", (req, res) => res.sendFile(path.join(__dirname, "contact.html")));

// 8. Google Login Routes (standard)
app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
app.get("/auth/google/callback", passport.authenticate("google", {
    successRedirect: "/app.html", failureRedirect: "/",
}));
app.get("/auth/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect("/");
  });
});
app.get("/api/user", (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      user: { firstName: req.user.name.givenName, email: req.user.emails[0].value, photo: req.user.photos[0].value },
    });
  } else {
    res.json({ user: null });
  }
});

// 9. AI Routes (Secured and Multi-Tiered)

// Analyzer tab (Summarize and Find Solution use this)
app.post("/generate", ensureAuthenticated, async (req, res) => {
  try {
    const { text, prompt } = req.body;
    const fullPrompt = `${prompt}: ${text}`;

    const aiResponse = await runAiQuery(fullPrompt);

    if (aiResponse.success) {
        res.json({ success: true, content: aiResponse.content });
    } else {
        res.status(500).json(aiResponse);
    }
  } catch (error) {
    res.status(500).json({ success: false, content: "Error communicating with AI service." });
  }
});

// Subscription Audit Agent
app.post("/audit-cost", ensureAuthenticated, async (req, res) => {
    try {
        const { text, prompt } = req.body;
        const fullPrompt = `${prompt}: ${text}`;

        const aiResponse = await runAiQuery(fullPrompt);
        
        if (aiResponse.success) {
            res.json({ success: true, content: aiResponse.content });
        } else {
            res.status(500).json(aiResponse);
        }
    } catch (error) {
        res.status(500).json({ success: false, content: "Error communicating with the Subscription Audit Agent." });
    }
});


// Risk Analysis route
app.post("/risk-analyze", ensureAuthenticated, async (req, res) => {
    try {
        const { text, prompt } = req.body;
        const fullPrompt = `${prompt}: ${text}`;

        const aiResponse = await runAiQuery(fullPrompt);
        
        if (aiResponse.success) {
            res.json({ success: true, content: aiResponse.content });
        } else {
            res.status(500).json(aiResponse);
        }
    } catch (error) {
        res.status(500).json({ success: false, content: "Error communicating with the Risk Analysis Agent." });
    }
});


// Q&A Chat tab
app.post("/chat", ensureAuthenticated, async (req, res) => {
  try {
    const { message } = req.body;

    const aiResponse = await runAiQuery(message);

    if (aiResponse.success) {
        res.json({ success: true, reply: aiResponse.content });
    } else {
        res.status(500).json({ success: false, reply: aiResponse.content });
    }
  } catch (error) {
    res.status(500).json({ success: false, reply: "Error communicating with AI." });
  }
});

// 10. Start Server
app.listen(port, () => {
  console.log(`✅ NexaGrind server running at http://localhost:${port}`);
});