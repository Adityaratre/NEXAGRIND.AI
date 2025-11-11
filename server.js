// 1. Load all our "engine parts"
const express = require('express');
const path = require('path');
const OpenAI = require('openai');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
require('dotenv').config(); // Loads the API key from .env

// 2. Setup the Server
const app = express();
const port = 3000;
// CRITICAL FIX: Define variables here so the rest of the file sees them
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const BASE_URL = IS_PRODUCTION ? process.env.LIVE_SITE_URL : `http://localhost:${port}`;

// 3. Setup Middlewares
app.use(express.json()); // Allow the server to read JSON data

// 4. Setup Passport (Google Login Strategy) and Session Management

if (IS_PRODUCTION) {
    // 4a. Production/Render Setup: We set trust proxy and force HTTPS
    app.set('trust proxy', 1); 
    
    // Configure the Strategy using the LIVE_SITE_URL environment variable
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        // CRITICAL FIX: The callback URL must be HTTPS on Render
        callbackURL: `${process.env.LIVE_SITE_URL}/auth/google/callback` 
    },
    (accessToken, refreshToken, profile, done) => {
        return done(null, profile);
    }));

    // Secure session setup for HTTPS
    app.use(session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: true,
        cookie: { 
            secure: true, // MUST BE TRUE FOR HTTPS
            httpOnly: true,
            sameSite: 'lax'
        }
    }));

} else {
    // 4b. Local Development Setup
    // Use the local BASE_URL variable and insecure cookies
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${BASE_URL}/auth/google/callback` 
    },
    (accessToken, refreshToken, profile, done) => {
        return done(null, profile);
    }));

    // Insecure session setup for HTTP on localhost
    app.use(session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: true,
        cookie: { 
            secure: false, // MUST BE FALSE for HTTP on localhost
            httpOnly: true,
            sameSite: 'lax'
        }
    }));
}
// Initialize Passport *after* session setup
app.use(passport.initialize());
app.use(passport.session());
// --- END OF CORRECTED TOP SECTION ---

// 5. Setup the AI (OpenRouter)
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_KEY, 
  baseURL: "https://openrouter.ai/api/v1", 
});
// 6. Helper Function to check if user is logged in
// This is our security guard for the AI routes
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next(); // User is logged in, continue
    }
    // User is not logged in, send an error
    res.status(401).json({ error: 'You must be logged in to do that.' });
}

// 7. Define All Page Routes (Serving the HTML files)

// Serve the Home Page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve the "Get Help" App Page
app.get('/app.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'app.html'));
});

// Serve the "Contact Us" Page
app.get('/contact.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'contact.html'));
});


// 8. Define All Google Login Routes

// When user clicks "Login", send them to Google
app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

// After Google login, Google sends them back here
app.get('/auth/google/callback', 
    passport.authenticate('google', { 
        successRedirect: '/app.html', // On success, send them to the app
        failureRedirect: '/' // On failure, send them back home
    })
);

// Route for the "Logout" button
app.get('/auth/logout', (req, res, next) => {
    req.logout(err => {
        if (err) { return next(err); }
        res.redirect('/');
    });
});

// Route for the frontend to check if a user is logged in
app.get('/api/user', (req, res) => {
    if (req.isAuthenticated()) {
        // Send back user data
        res.json({
            user: {
                firstName: req.user.name.givenName,
                email: req.user.emails[0].value,
                photo: req.user.photos[0].value
            }
        });
    } else {
        // Send back no user
        res.json({ user: null });
    }
});
// 9. Define All AI API Routes
// We add 'ensureAuthenticated' to these routes
// This means no one can use the AI unless they are logged in

// This route handles the "Analyzer" tab buttons
app.post('/generate', ensureAuthenticated, async (req, res) => {
  try {
    const { text, prompt } = req.body;
    const fullPrompt = `${prompt}: ${text}`;

    const completion = await openai.chat.completions.create({
      messages: [{ role: 'user', content: fullPrompt }],
      model: "openai/gpt-oss-20b:free", 
    });

    const aiText = completion.choices[0].message.content;
    res.json({ success: true, content: aiText });

  } catch (error) {
    console.error(error);
    res.json({ success: false, content: 'Error generating content from AI.' });
  }
});

// This route handles the "Q&A Chat" tab
app.post('/chat', ensureAuthenticated, async (req, res) => {
  try {
    const { message } = req.body;
    
    const completion = await openai.chat.completions.create({
      messages: [{ role: 'user', content: message }],
      model: "openai/gpt-oss-20b:free", 
    });

    const aiText = completion.choices[0].message.content;
    res.json({ success: true, reply: aiText });

  } catch (error) {
    console.error(error);
    res.json({ success: false, reply: 'Error communicating with AI.' });
  }
});

// 10. Start the Server
app.listen(port, () => {
  console.log(`✅ NexaGrind server (with Google Login) running at http://localhost:${port}`);
});