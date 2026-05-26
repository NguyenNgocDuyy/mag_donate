// ─────────────────────────────────────────────────────────────────────────────
//  /api/webhook.js  ·  Vercel Serverless Function
//
//  Receives POST from Casso or SePay when a bank transaction arrives.
//  Filters by DONATION_PHRASE, then writes to Supabase.
//
//  ENV VARS (set in Vercel dashboard → Settings → Environment Variables):
//    SUPABASE_URL          your Supabase project URL
//    SUPABASE_SERVICE_KEY  your Supabase service-role key (secret)
//    DONATION_PHRASE       e.g. "ỦNG HỘ" or "DONATE" — must be start of message
//    WEBHOOK_SECRET        the secret token you set in Casso/SePay dashboard
//    GOAL_AMOUNT           fundraising goal in VND, e.g. "5000000"
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
)

const PHRASE = (process.env.DONATION_PHRASE || "DONATE").trim().toUpperCase()

export default async function handler(req, res) {
    // ── Only accept POST ──────────────────────────────────────────────────────
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" })
    }

    // ── Verify secret token ───────────────────────────────────────────────────
    // Casso sends it as ?token=... in the query string.
    // SePay sends it as the Authorization header: "Apikey YOUR_SECRET"
    const tokenFromQuery  = req.query.token
    const tokenFromHeader = (req.headers.authorization || "").replace("Apikey ", "").trim()
    const providedToken   = tokenFromQuery || tokenFromHeader

    if (providedToken !== process.env.WEBHOOK_SECRET) {
        return res.status(401).json({ error: "Unauthorized" })
    }

    // ── Parse body ────────────────────────────────────────────────────────────
    const body = req.body

    // Normalise Casso vs SePay payload shapes into one object:
    //   { amount, description, when }
    let amount, description, when

    // --- Casso format ---
    if (body.data && Array.isArray(body.data)) {
        const tx = body.data[0]
        amount      = Number(tx.amount)
        description = String(tx.description || "")
        when        = tx.when || new Date().toISOString()

    // --- SePay format ---
    } else if (body.transferAmount !== undefined) {
        amount      = Number(body.transferAmount)
        description = String(body.content || "")
        when        = body.transactionDate || new Date().toISOString()

    } else {
        return res.status(400).json({ error: "Unknown payload shape" })
    }

    // ── Filter by phrase ──────────────────────────────────────────────────────
    // Only count if the description (after trimming) STARTS WITH the phrase
    if (!description.trim().toUpperCase().startsWith(PHRASE)) {
        return res.status(200).json({ status: "ignored", reason: "phrase mismatch" })
    }

    // ── Extract donor name & message ──────────────────────────────────────────
    // Convention: "<PHRASE> <Name>: <message>" or just "<PHRASE> <message>"
    const afterPhrase = description.trim().slice(PHRASE.length).trim()
    let donorName = "Ẩn danh"
    let message   = afterPhrase

    // If there's a colon, treat left side as name and right as message
    const colonIdx = afterPhrase.indexOf(":")
    if (colonIdx > 0) {
        donorName = afterPhrase.slice(0, colonIdx).trim() || "Ẩn danh"
        message   = afterPhrase.slice(colonIdx + 1).trim()
    }

    // ── Insert into Supabase ──────────────────────────────────────────────────
    const { error } = await supabase.from("donations").insert({
        amount,
        donor_name:  donorName,
        message,
        description, // original full string, for debugging
        donated_at:  when,
    })

    if (error) {
        console.error("Supabase insert error:", error)
        return res.status(500).json({ error: "Database write failed" })
    }

    return res.status(200).json({ status: "ok", amount, donorName, message })
}
