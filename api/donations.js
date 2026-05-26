// ─────────────────────────────────────────────────────────────────────────────
//  /api/donations.js  ·  Vercel Serverless Function
//
//  Public read endpoint — called by the Framer component every 30 s.
//  Returns: { total, goal, recentMessages, topDonors }
//
//  ENV VARS (same Vercel project):
//    SUPABASE_URL
//    SUPABASE_SERVICE_KEY
//    GOAL_AMOUNT   fundraising goal in VND, e.g. "5000000"
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
)

const GOAL = Number(process.env.GOAL_AMOUNT || 5_000_000)

export default async function handler(req, res) {
    // Allow Framer to call this from the browser
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
    if (req.method === "OPTIONS") return res.status(200).end()
    if (req.method !== "GET")    return res.status(405).end()

    const now       = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    // ── 1. Total raised this month (for progress bar) ─────────────────────────
    const { data: totalData, error: totalErr } = await supabase
        .from("donations")
        .select("amount")
        .gte("donated_at", monthStart)

    if (totalErr) return res.status(500).json({ error: totalErr.message })

    const total = (totalData || []).reduce((s, r) => s + Number(r.amount), 0)

    // ── 2. 20 most recent messages ────────────────────────────────────────────
    const { data: recent, error: recentErr } = await supabase
        .from("donations")
        .select("donor_name, message, amount, donated_at")
        .gte("donated_at", monthStart)
        .order("donated_at", { ascending: false })
        .limit(20)

    if (recentErr) return res.status(500).json({ error: recentErr.message })

    // ── 3. Top 3 donors this month ────────────────────────────────────────────
    const { data: allThisMonth, error: topErr } = await supabase
        .from("donations")
        .select("donor_name, amount")
        .gte("donated_at", monthStart)

    if (topErr) return res.status(500).json({ error: topErr.message })

    // Aggregate by donor_name
    const totalsMap = {}
    for (const row of allThisMonth || []) {
        const name = row.donor_name || "Ẩn danh"
        totalsMap[name] = (totalsMap[name] || 0) + Number(row.amount)
    }

    const topDonors = Object.entries(totalsMap)
        .map(([name, sum]) => ({ name, total: sum }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 3)

    return res.status(200).json({
        total,
        goal: GOAL,
        recentMessages: (recent || []).map((r) => ({
            name:    r.donor_name,
            message: r.message,
            amount:  r.amount,
            time:    r.donated_at,
        })),
        topDonors,
        month: `${now.getMonth() + 1}/${now.getFullYear()}`,
    })
}
