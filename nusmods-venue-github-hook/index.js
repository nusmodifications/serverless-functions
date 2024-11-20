import { Octokit } from '@octokit/rest';

const codeBlock = (text, lang = '') => '```' + lang + '\n' + text + '\n```';
const unorderedList = (items) => items.map(item => '- ' + item).join('\n');

function toDataList(data) {
  const dataList = [
    `Room Name: ${data.roomName}`,
    `Floor: ${data.floor}`,
  ];
  if (data.location) {
    const { x, y } = data.location;
    dataList.push(`Location: [${y}, ${x}](https://www.openstreetmap.org/?mlat=${y}&mlon=${x}#map=19/${y}/${x})`);
  }
  return unorderedList(dataList);
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

    const parsedBody = await request.json();
    if (parsedBody === null) {
      return new Response(null, { status: 400, headers: respHeaders });
    }
    const { venue, room, latlng, floor, reporterEmail, debug = false } = parsedBody;

    let currentVenue = null;
    let currentVenueError = null;

    try {
      const response = await fetch('https://github.nusmods.com/venues');
      const currentVenues = await response.json();
      currentVenue = currentVenues[venue];
    } catch (e) {
      currentVenueError = e;
    }

    const data = {
      roomName: room,
      floor,
    };

    if (latlng) {
      // TODO: Check latlng param validity
      const [y, x] = latlng;
      data.location = { x, y };
    }

    const paragraphs = [];
    if (reporterEmail) {
      paragraphs.unshift(`Reporter: ${reporterEmail}`);
    }
    paragraphs.push(toDataList(data));

    if (currentVenue) {
      const json = JSON.stringify(currentVenue, null, 2);
      paragraphs.push('**Current version:**');
      paragraphs.push(codeBlock(json, 'json'));
    } else if (currentVenueError) {
      paragraphs.push('**Error fetching current version**');
      paragraphs.push(codeBlock(currentVenueError.stack));
    } else {
      paragraphs.push('**Venue does not exist in current version**');
    }

    paragraphs.push('**Update proposed:**');
    paragraphs.push(codeBlock(`"${venue}": ${JSON.stringify(data, null, 2)}`, 'json'));

    const body = paragraphs.join('\n\n');
    console.log(body);


    if (!env.MOCK_GITHUB && !debug) {
      const octokit = new Octokit({ auth: env.GITHUB_TOKEN });
      await octokit.issues.create({
        owner: env.GITHUB_ORG,
        repo: env.GITHUB_REPO,
        title: `Venue data update for ${venue}`,
        body,
        labels: ['venue data'],
      });
    }

    return new Response(null, { status: 202, headers: respHeaders });
  },
};
