const nodemailer = require('nodemailer');
const axios = require('axios');

const transporter = nodemailer.createTransport({
    secure: true,
    host: process.env.SMTP_HOST,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
    }
}, {
    from: process.env.FROM_ADDRESS,
});

async function getFacultyEmail(contactId) {
    const { data } = await axios.get('https://raw.githubusercontent.com/nusmodifications/nusmods/master/website/src/data/facultyEmail.json');
    const contact = data.find(contact => contact.id === contactId);

    if (!contact) return undefined;
    return contact.email;
}

async function checkKillSwitch() {
    try {
        const { data } = await axios.get(`https://nusmods.com/${process.env.KILL_SWITCH_KEY}`, {
            responseType: 'text',
        });

        return data === 'stop';
    } catch (e) {
        console.error('Could not contact killswitch');
        console.error(e);
        return true;
    }
}

function addBlockquoteMarkers(message) {
    return message.split('\n').map(line => `> ${line}`).join('\n');
}

/**
 * Sends emails about issues with modules to NUS
 *
 * @param {string} name
 * @param {string} contactId
 * @param {string} moduleCode
 * @param {string} replyTo
 * @param {string} message
 * @param {string} matricNumber
 * @param {boolean} debug
 */
module.exports = async (name, contactId, moduleCode, replyTo, message, matricNumber, debug = false) => {
    const facultyEmail = await getFacultyEmail(contactId);
    console.log(`Sending email to ${facultyEmail}`);

    let debugMessage = '';
    let email;
    let cc = [];
    
    if (debug) {
        debugMessage = `This is a debug email. If this was in production this would have been sent to <${facultyEmail}>.
========================\n`;
        email = 'modules@nusmods.com';
    } else if (await checkKillSwitch()) {
        debugMessage = `The killswitch has been activated. This email would originally have been sent to <${facultyEmail}>.
========================\n`;
        email = 'modules@nusmods.com';
    } else {
        email = facultyEmail;
        cc = ['modules@nusmods.com', replyTo];
    }

    const moduleUrl = `https://nusmods.com/modules/${moduleCode}`;

    try {
        await transporter.sendMail({
            to: email,
            cc,
            replyTo: `${name} <${replyTo}>`,
            subject: `[NUSMods] Enquiry/issue about ${moduleCode} on NUSMods from ${name} (${matricNumber})`,
            text: `${debugMessage}Hello,

${name} (${matricNumber}) reported the following issue with ${moduleCode} (${moduleUrl}) on NUSMods. Since NUSMods obtains its information directly from the Registrar's Office, we hope you can help check that the information is correct and update it if necessary.

${addBlockquoteMarkers(message)}

Please reply directly to this email to reply to the student. You can also reply to modules@nusmods.com (which is cc'd on this email) if you believe the issue is with NUSMods itself. If you have already made changes to the module, please note that it may take up to 24 hours to be reflected on NUSMods.

Regards,
The NUSMods Team`,
        });
    } catch (e) {
        console.error(e);
        throw e;
    }
};
