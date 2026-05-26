// v4
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
)

const PHRASE = (process.env.DONATION_PHRASE || "DONATE").trim().toUpperCase()

function stripRefCode(text) {
    return text.replace(/\s*[A-Z0-9]{6,12}\/\d{4,10}\s*$/i, "").trim()
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
            when = rawTime ? rawTime.replace(" ", "T") + "+07:00" : new Date().toISOString()
        } else {
            return res.status(200).json({ success: true })
        }

        const upperContent = rawContent.toUpperCase()
        const phraseIdx    = upperContent.indexOf(PHRASE)
        if (phraseIdx === -1) {
            return res.status(200).json({ success: true })
        }

        let afterPhrase = stripRefCode(rawContent.slice(phraseIdx + PHRASE.length).trim())
        const upper     = afterPhrase.toUpperCase()

        let donorName = "Ẩn danh"
        let message   = ""

        // Find NAME keyword (must have content after it)
        const nameIdx = upper.indexOf("NAME ")
        // Find MSG keyword — works whether at start or in the middle
        const msgAtStart  = upper.startsWith("MSG ") ? 0 : -1
        const msgInMiddle = upper.indexOf(" MSG ")
        const msgIdx      = msgInMiddle !== -1 ? msgInMiddle : msgAtStart

        if (nameIdx !== -1 && msgIdx !== -1 && msgIdx > nameIdx) {
            // Both: "name Duy msg hello"
            const nameEnd = msgIdx === msgAtStart ? msgIdx : msgInMiddle
            donorName = stripRefCode(afterPhrase.slice(nameIdx + 5, nameEnd).trim()) || "Ẩn danh"
            const msgContentStart = msgIdx === msgAtStart ? 4 : msgInMiddle + 5
            message   = stripRefCode(afterPhrase.slice(msgContentStart).trim())
        } else if (nameIdx !== -1 && msgIdx === -1) {
            // Only name: "name Duy"
            donorName = stripRefCode(afterPhrase.slice(nameIdx + 5).trim()) || "Ẩn danh"
            message   = ""
        } else if (msgIdx !== -1) {
            // Only msg (no name): "msg hello" → name stays Ẩn danh
            const msgContentStart = msgIdx === msgAtStart ? 4 : msgInMiddle + 5
            message = stripRefCode(afterPhrase.slice(msgContentStart).trim())
        } else {
            // No keywords at all → treat whole thing as message
            message = stripRefCode(afterPhrase)
        }

        // Fallback: use bank sender name only when name keyword was not provided
        if (donorName === "Ẩn danh" && nameIdx === -1 && body.description) {
            const autoName = String(body.description)
                .replace(/BankAPINotify/gi, "")
                .replace(new RegExp(PHRASE, "gi"), "")
                .replace(/chuyen tien/gi, "")
                .replace(/FT[A-Z0-9]+/gi, "")
                .replace(/[A-Z0-9]{6,12}\/\d{4,10}/gi, "")
                .replace(/MSG .*/gi, "")
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
