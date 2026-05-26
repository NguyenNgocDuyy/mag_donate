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
        when        = body.transactionDate || new Date().toISOString()
    } else {
        return res.status(200).json({ success: true })
    }

    // if (!description.trim().toUpperCase().startsWith(PHRASE)) {
    //     return res.status(200).json({ success: true })
    // }
    // original code here
    const afterPhrase = description.trim().slice(PHRASE.length).trim()
    //const afterPhrase = description //modified to skip start phrase
    let donorName = "Ẩn danh"
    let message   = afterPhrase

    const colonIdx = afterPhrase.indexOf(":")
    if (colonIdx > 0) {
        donorName = afterPhrase.slice(0, colonIdx).trim() || "Ẩn danh"
        message   = afterPhrase.slice(colonIdx + 1).trim()
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
