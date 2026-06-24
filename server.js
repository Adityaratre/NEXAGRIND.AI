const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// 1. THE FIX FOR YOUR MAIN WEBSITE
// This line tells Express to serve all your HTML files (index, contact, app, etc.)
// ==========================================
app.use(express.static(__dirname));

// Middleware to read JSON data from the frontend
app.use(express.json());

// ==========================================
// 2. NEW ROUTE: AI Test Dashboard
// ==========================================
app.get('/ai-test', (req, res) => {
    // This serves the new standalone dashboard we created
    res.sendFile(path.join(__dirname, 'ai-test-dashboard.html')); 
});

// ==========================================
// 3. DUMMY DATABASE FOR AI TEST
// ==========================================
const sscDatabase = [
  {
    id: 1, subject: "Reasoning", section: "Verbal", topic: "Analogy",
    question: "AOM : KWS :: GEV : ?", options: { A: "QOF", B: "ROE", C: "QPE", D: "PPD" }, correct: "C", pattern: "NEW_VENDOR_2026"
  },
  {
    id: 2, subject: "Quantitative Aptitude", section: "Arithmetic", topic: "Percentages",
    question: "If A's salary is 20% more than B's, by what percent is B's salary less than A's?", options: { A: "16.66%", B: "20%", C: "25%", D: "15%" }, correct: "A", pattern: "OLD_TCS"
  }
];

// ==========================================
// 4. API: Start CBT Test
// ==========================================
app.post('/api/cbt/start', (req, res) => {
    const { testType, subject, pattern } = req.body;
    // Sends the questions to the CBT interface
    res.json({ success: true, questions: sscDatabase });
});

// ==========================================
// 5. API: Evaluate Test
// ==========================================
app.post('/api/cbt/evaluate', (req, res) => {
    // Returns dummy diagnostic data to prevent crashes
    res.json({
        success: true,
        metrics: { finalScore: "4.00", accuracy: '100%', correctAnswers: 2, incorrectAnswers: 0 },
        aiDiagnosticReport: { 
            strongZones: ["Analogy", "Percentages"], 
            weakZones: ["None currently detected."], 
            actionableRevisionPath: ["Keep practicing PYQs."] 
        }
    });
});

// ==========================================
// 6. START THE SERVER
// ==========================================
app.listen(PORT, () => {
    console.log(`\n✅ SUCCESS! Server is running.`);
    console.log(`👉 Main Website (Index): http://localhost:${PORT}/`);
    console.log(`👉 AI Test Dashboard: http://localhost:${PORT}/ai-test\n`);
});