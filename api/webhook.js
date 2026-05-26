// v3
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
)

const PHRASE = (process.env.DONATION_PHRASE || "DONATE").trim().toUpperCase()

// Remove MB Bank reference codes like "Q2YI1BS4/544360" from end of string
function stripRefCode(text) {
    return text
        .replace(/\s*[A-Z0-9]{6,12}\/\d{4,10}\s*$/i, "")
        .trim()
}

export default async function handler(req, res) {
    if (req.method === "GET") {
        return res.status(200).json({ success: true })
    }
    if (req.method !== "POST") {
        return res.status(200).json({ success: true })
    }

    try {
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
            const rawTime = String(body.transactionDate || "")
            when = rawTime
                ? rawTime.replace(" ", "T") + "+07:00"
                : new Date().toISOString()
        } else {
            return res.status(200).json({ success: true })
        }

        // Find phrase anywhere in the message (banks may prepend numbers/text)
        const upperContent = rawContent.toUpperCase()
        const phraseIdx    = upperContent.indexOf(PHRASE)

        if (phraseIdx === -1) {
            return res.status(200).json({ success: true })
        }

        // Everything after the phrase keyword, ref code stripped
        let afterPhrase = stripRefCode(
            rawContent.slice(phraseIdx + PHRASE.length).trim()
        )

        let donorName = "Ẩn danh"
        let message   = afterPhrase

        // ── Keyword format: "arkivist name NgocDuy msg xin chao vietnam" ──
        // Banks convert everything to uppercase so we search case-insensitively
        const upper   = afterPhrase.toUpperCase()
        const nameIdx = upper.indexOf("NAME ")
        const msgIdx  = upper.indexOf(" MSG ")

        if (nameIdx !== -1 && msgIdx !== -1 && msgIdx > nameIdx) {
            // Both keywords present
            donorName = stripRefCode(afterPhrase.slice(nameIdx + 5, msgIdx).trim()) || "Ẩn danh"
            message   = stripRefCode(afterPhrase.slice(msgIdx + 5).trim())
        } else if (nameIdx !== -1) {
            // Only name keyword
            donorName = stripRefCode(afterPhrase.slice(nameIdx + 5).trim()) || "Ẩn danh"
            message   = ""
        } else if (msgIdx !== -1) {
            // Only msg keyword
            message = stripRefCode(afterPhrase.slice(msgIdx + 5).trim())
        }

        // Fallback: use bank sender name from SePay's description field
        if (donorName === "Ẩn danh" && body.description) {
            const autoName = String(body.description)
                .replace(/BankAPINotify/gi, "")
                .replace(/chuyen tien/gi, "")
                .replace(/FT[A-Z0-9]+/gi, "")
                .replace(/[A-Z0-9]{6,12}\/\d{4,10}/gi, "")
                .trim()
            if (autoName.length > 0) donorName = autoName
        }

        const { error } = await supabase.from("donations").insert({
            amount,
            donor_name:  donorName,
            message:     message || "(no message)",
            description: rawContent,
            donated_at:  when,
        })

        if (error) console.error("Supabase insert error:", error)

    } catch (err) {
        console.error("Webhook error:", err)
    }

    return res.status(200).json({ success: true })
}
