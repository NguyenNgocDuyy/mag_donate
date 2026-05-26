export default function handler(req, res) {
    res.status(200).json({
        phrase:    process.env.DONATION_PHRASE || "NOT SET",
        goal:      process.env.GOAL_AMOUNT     || "NOT SET",
        supabase:  process.env.SUPABASE_URL    ? "SET ✓" : "MISSING ✗",
        svcKey:    process.env.SUPABASE_SERVICE_KEY ? "SET ✓" : "MISSING ✗",
    })
}
