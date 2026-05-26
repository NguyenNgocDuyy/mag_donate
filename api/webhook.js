import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
)

const PHRASE = (process.env.DONATION_PHRASE || "DONATE").trim().toUpperCase()

export default async function handler(req, res) {
    // SePay sends a GET ping to verify the URL — always respond with success
    if (req.method === "GET") {
        return res.status(200).json({ success: true })
    }

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" })
    }

    const body = req.body || {}

    let amount, description, when

    if (body.data && Array.isArray(body.data)) {
        const tx = body.data[0]
        amount      = Number(tx.amount)
        description = String(tx.description || "")
        when        = tx.when || new Date().toISOString()
    } else if (body.transferAmount !== undefined) {
        amount      = Number(body.transferAmount)
        description = String(body.content || "")
        // SePay time is GMT+7 — append offset so Supabase stores it correctly
        const rawTime = body.transactionDate || ""
        when = rawTime ? rawTime.replace(" ", "T") + "+07:00" : new Date().toISOString()
    } else {
        return res.status(200).json({ success: true })
    }

    if (!description.trim().toUpperCase().startsWith(PHRASE)) {
        return res.status(200).json({ success: true })
    }

    const afterPhrase = description.trim().slice(PHRASE.length).trim()
    let donorName = "Ẩn danh"
    let message   = afterPhrase

    // Try to split name from message using " - " as separator
    const dashIdx = afterPhrase.indexOf(" - ")
    if (dashIdx > 0) {
        donorName = afterPhrase.slice(0, dashIdx).trim() || "Ẩn danh"
        message   = afterPhrase.slice(dashIdx + 3).trim()
    }

    // If no separator found, try to get sender name from SePay's description field
    // SePay description looks like "BankAPINotify NGUYEN VAN A chuyen tien"
    if (donorName === "Ẩn danh" && body.description) {
        const descParts = String(body.description).replace("BankAPINotify", "").trim()
        // Remove common suffixes banks append
        const cleaned = descParts
            .replace(/chuyen tien/gi, "")
            .replace(/CHUYEN TIEN/gi, "")
            .replace(/FT\w+/g, "")
            .trim()
        if (cleaned.length > 0) donorName = cleaned
    }

    const { error } = await supabase.from("donations").insert({
        amount,
        donor_name:  donorName,
        message,
        description,
        donated_at:  when,
    })

    if (error) {
        console.error("Supabase insert error:", error)
        return res.status(200).json({ success: true })
    }

    return res.status(200).json({ success: true })
}
