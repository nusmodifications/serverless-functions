import { Resend } from "resend";

const addBlockquoteMarkers = msg => msg.split('\n').map(line => `> ${line}`).join('\n');

async function getFacultyEmail(contactId) {
    const resp = await fetch('https://raw.githubusercontent.com/nusmodifications/nusmods/master/website/src/data/facultyEmail.json');
    const data = await resp.json();
    const contact = data.find(contact => contact.id === contactId);
    return contact ? contact.email : null;
}

async function parseStreamAsJson(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    const totalLen = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    if (totalLen === 0) {
        return null;
    }
    const mergedChunks = new Uint8Array(totalLen);
    for (let i = 0, offset = 0; i < chunks.length; offset += chunks[i].length, ++i) {
        mergedChunks.set(chunks[i], offset);
    }
    return JSON.parse(new TextDecoder().decode(mergedChunks));
}

/**
 * @typedef {Object} Env
 */
export default {

    /**
     * @param {Request} request
     * @param {Env} env
     * @param {ExecutionContext} ctx
     * @returns {Promise<Response>}
     */
    async fetch(request, env, _) {
        const respHeaders = new Headers();
        respHeaders.set('Access-Control-Allow-Origin', '*');
        respHeaders.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
        respHeaders.set('Access-Control-Allow-Headers', '*');
        respHeaders.set('Allow', 'POST, OPTIONS');

        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: respHeaders });
        }

        if (request.method !== "POST" || request.body === null) {
            return new Response(null, { status: 400, headers: respHeaders });
        }

        const parsedBody = await parseStreamAsJson(request.body);
        if (parsedBody === null) {
            return new Response(null, { status: 400, headers: respHeaders });
        }
        const { name, contactId, moduleCode, replyTo, message, matricNumber, debug = false } = parsedBody;
        const facultyEmail = await getFacultyEmail(contactId);

        let debugMessage = '';
        let email;
        let cc = [];

        if (debug) {
            debugMessage = `This is a debug email. If this was in production this would have been sent to <${facultyEmail}>.
========================\n`;
            email = 'modules@nusmods.com';
        } else {
            email = facultyEmail;
            cc = ['modules@nusmods.com', replyTo];
        }

        const moduleUrl = `https://nusmods.com/modules/${moduleCode}`;
        const resend = new Resend(env.RESEND_API_KEY);
        const { error } = await resend.emails.send({
            from: 'mods@nusmods.com',
            to: email,
            cc,
            reply_to: `${name} <${replyTo}>`,
            subject: `[NUSMods] Enquiry/issue about ${moduleCode} on NUSMods from ${name} (${matricNumber})`,
            text: `${debugMessage}Hello,

${name} (${matricNumber}) reported the following issue with ${moduleCode} (${moduleUrl}) on NUSMods. Since NUSMods obtains its information directly from the Registrar's Office, we hope you can help check that the information is correct and update it if necessary.

${addBlockquoteMarkers(message)}

Please reply directly to this email to reply to the student. You can also reply to modules@nusmods.com (which is cc'd on this email) if you believe the issue is with NUSMods itself. If you have already made changes to the module, please note that it may take up to 24 hours to be reflected on NUSMods.

Regards,
The NUSMods Team`,
        });
        if (error) {
            throw error;
        }

        return new Response(null, { status: 202, headers: respHeaders });
    }
}
