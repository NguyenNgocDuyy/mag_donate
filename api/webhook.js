import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
)

const PHRASE = (process.env.DONATION_PHRASE || "DONATE").trim().toUpperCase()

// Strip bank-appended reference codes like "Q2YI12XL/716938" at the end
function stripRefCode(text) {
    return text.replace(/\s+[A-Z0-9]{6,}\/\d{4,}\s*$/i, "").trim()
}

export default async function handler(req, res) {
    if (req.method === "GET") {
        return res.status(200).json({ success: true })
    }
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" })
    }

    const body = req.body || {}

    let amount, rawContent, when

    if (body.data && Array.isArray(body.data)) {
        const tx = body.data[0]
        amount     = Number(tx.amount)
        rawContent = String(tx.description || "")
        when       = tx.when || new Date().toISOString()
    } else if (body.transferAmount !== undefined) {
        amount     = Number(body.transferAmount)
        rawContent = String(body.content || "")
        // SePay sends time in GMT+7 — store with correct offset
        const rawTime = body.transactionDate || ""
        when = rawTime
            ? rawTime.replace(" ", "T") + "+07:00"
            : new Date().toISOString()
    } else {
        return res.status(200).json({ success: true })
    }

    // ── Find phrase anywhere in the message (banks may prepend numbers) ──
    const upperContent = rawContent.toUpperCase()
    const phraseIdx    = upperContent.indexOf(PHRASE)
    if (phraseIdx === -1) {
        // Phrase not found — not a donation, ignore silently
        return res.status(200).json({ success: true })
    }

    // Everything after the phrase keyword
    let afterPhrase = rawContent.slice(phraseIdx + PHRASE.length).trim()

    // Strip bank reference code from the end (e.g. "Q2YI12XL/716938")
    afterPhrase = stripRefCode(afterPhrase)

    let donorName = "Ẩn danh"
    let message   = afterPhrase

    // Split on " - " to get name and message
    const dashIdx = afterPhrase.indexOf(" - ")
    if (dashIdx > 0) {
        donorName = stripRefCode(afterPhrase.slice(0, dashIdx).trim()) || "Ẩn danh"
        message   = afterPhrase.slice(dashIdx + 3).trim()
    }

    // Fallback: extract sender name from SePay's description field
    // Format: "BankAPINotify NGUYEN VAN A chuyen tien FTxxxxxxxx"
    if (donorName === "Ẩn danh" && body.description) {
        let autoName = String(body.description)
            .replace(/BankAPINotify/gi, "")
            .replace(/chuyen tien/gi, "")
            .replace(/FT\w+/g, "")
            .replace(/\s+[A-Z0-9]{6,}\/\d{4,}/gi, "")
            .trim()
        if (autoName.length > 0) donorName = autoName
    }

    const { error } = await supabase.from("donations").insert({
        amount,
        donor_name:  donorName,
        message,
        description: rawContent,
        donated_at:  when,
    })

    if (error) {
        console.error("Supabase insert error:", error)
    }

    return res.status(200).json({ success: true })
}
