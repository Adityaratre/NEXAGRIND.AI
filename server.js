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
  app.set("trust proxy", 1); // CRITICAL for Render to recognize HTTPS

  // Secure session setup for HTTPS
  app.use(
    session({
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: true,
      cookie: {
        secure: true, // MUST be true for HTTPS
        httpOnly: true,
        sameSite: "lax",
      },
    })
  );
  
  // Configure the Strategy using the LIVE_SITE_URL environment variable
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${process.env.LIVE_SITE_URL}/auth/google/callback`, // HTTPS for production
      },
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
      cookie: {
        secure: false, // MUST be false for HTTP on localhost
        httpOnly: true,
        sameSite: "lax",
      },
    })
  );

  // Configure the Strategy using the local BASE_URL variable
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${BASE_URL}/auth/google/callback`, // Works for localhost
      },
      (accessToken, refreshToken, profile, done) => done(null, profile)
    )
  );
}

// Initialize Passport after session
app.use(passport.initialize());
app.use(passport.session());

// Required for session serialization
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// 5. Setup OpenRouter AI client
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

// 6. Middleware: Ensure user is authenticated (Security Guard)
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: "You must be logged in to do that." });
}

// 7. Serve frontend HTML pages (using relative paths)
app.use(express.static(__dirname));

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/app.html", (req, res) => res.sendFile(path.join(__dirname, "app.html")));
app.get("/contact.html", (req, res) => res.sendFile(path.join(__dirname, "contact.html")));

// 8. Google Login Routes
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
      user: {
        firstName: req.user.name.givenName,
        email: req.user.emails[0].value,
        photo: req.user.photos[0].value,
      },
    });
  } else {
    res.json({ user: null });
  }
});

// 9. AI Routes (Secured by ensureAuthenticated)
// Analyzer tab (Summarize and Find Solution use this)
app.post("/generate", ensureAuthenticated, async (req, res) => {
  try {
    const { text, prompt } = req.body;
    const fullPrompt = `${prompt}: ${text}`;

    const completion = await openai.chat.completions.create({
      messages: [{ role: "user", content: fullPrompt }],
      model: "google/gemini-2.0-flash-exp:free",
    });

    const aiText = completion.choices[0].message.content;
    res.json({ success: true, content: aiText });
  } catch (error) {
    console.error("Error generating AI response:", error);
    res.json({ success: false, content: "Error generating content from AI." });
  }
});

// Subscription Audit Agent
app.post("/audit-cost", ensureAuthenticated, async (req, res) => {
    try {
        const { text, prompt } = req.body;
        const fullPrompt = `${prompt}: ${text}`;

        const completion = await openai.chat.completions.create({
            messages: [{ role: "user", content: fullPrompt }],
            model: "google/gemini-2.0-flash-exp:free",
        });

        const aiText = completion.choices[0].message.content;
        res.json({ success: true, content: aiText });
    } catch (error) {
        console.error("Error with audit AI:", error);
        res.json({ success: false, content: "Error communicating with the Subscription Audit Agent." });
    }
});


// Risk Analysis route
app.post("/risk-analyze", ensureAuthenticated, async (req, res) => {
    try {
        const { text, prompt } = req.body;
        const fullPrompt = `${prompt}: ${text}`;

        const completion = await openai.chat.completions.create({
            messages: [{ role: "user", content: fullPrompt }],
            model: "google/gemini-2.0-flash-exp:free",
        });

        const aiText = completion.choices[0].message.content;
        res.json({ success: true, content: aiText });
    } catch (error) {
        console.error("Error with risk analysis AI:", error);
        res.json({ success: false, content: "Error communicating with the Risk Analysis Agent." });
    }
});


// Q&A Chat tab
app.post("/chat", ensureAuthenticated, async (req, res) => {
  try {
    const { message } = req.body;

    const completion = await openai.chat.completions.create({
      messages: [{ role: "user", content: message }],
      model: "google/gemini-2.0-flash-exp:free",
    });

    const aiText = completion.choices[0].message.content;
    res.json({ success: true, reply: aiText });
  } catch (error) {
    console.error("Error with chat AI:", error);
    res.json({ success: false, reply: "Error communicating with AI." });
  }
});

// 10. Start Server
app.listen(port, () => {
  console.log(`✅ NexaGrind server running at http://localhost:${port}`);
});