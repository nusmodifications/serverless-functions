// TODO: Remove axios dependency
const axios = require('axios');
const assert = require('assert');

/**
* Each monitor consists of 
* 
* type Monitor = {
*   title: string;
*   description: string;
*   url: string;
*   config?: AxiosConfig;
*   // Additional checks for the request. Optionally return a string to customize 
*   // the status of the monitor
*   check?: (res: AxiosResponse) => string;
* }
*/
const MONITORS = [
  {
    title: 'Module Search',
    description: 'ElasticSearch server powering the module search page',
    url: 'https://nusmods-search.es.ap-southeast-1.aws.found.io:9243/modules_v2/_search',
    config: {
      method: 'POST',
      data: {
        query: {
          "match_all": {}
        },
        size: 1
      }
    },
    check: (res) => {
      const { total: { value, relation } } = res.data.hits;
      assert(value > 0 && ["eq", "gte", "gt"].includes(relation), 'No data in ElasticSearch server');
      return `At least ${value} modules`;
    }
  },
  {
    title: 'GitHub Venues Proxy',
    description: "Proxies venue data from GitHub's API since the API is IP rate limited",
    url: 'https://github.nusmods.com/venues',
    check: (res) => {
      const venues = res.data;
      const count = Object.keys(venues).length;
      assert(count > 0, 'No venues from venues proxy');
      return `${count} venues`;
    }
  },
  {
    title: 'GitHub Contributors Proxy',
    description: "Proxies contributor data from GitHub's API since the API is IP rate limited",
    url: 'https://github.nusmods.com/repo/contributors',
    check: (res) => {
      const count = res.data.length;
      assert(count > 0, 'No contributors from venues proxy');
      return `${count} contributors`;
    }
  },
  {
    title: 'Analytics',
    description: 'Self hosted Matomo analytics instance',
    url: 'https://analytics.nusmods.com/piwik.php'
  },
  {
    title: 'NextBus Proxy',
    description: 'Proxies NextBus data because the API does not have CORS headers',
    url: 'https://nnextbus.nusmods.com/ShuttleService?busstopname=KR-MRT'
  },
  // TODO: Re-add URL shortener some time (or maybe never?)
  // {
  //   title: 'URL shortener',
  //   description: 'Shortens NUSMods timetable URLs',
  //   url: 'https://nusmods.com/short_url.php',
  //   config: {
  //     params: {
  //       url: 'https://nusmods.com'
  //     }
  //   },
  //   check: (res) => {
  //     assert(Boolean(res.shorturl), 'URL shortener did not return short URL');
  //   }
  // },
  {
    title: 'Export',
    description: 'Timetable export service',
    url: 'https://nusmods.com/export/debug/'
  }
];

/**
* @param {string} format - Expected return format
* @returns {object.http}
*/
export default {
  async fetch(request, _, __) {
    const respHeaders = new Headers();
    respHeaders.set('Access-Control-Allow-Origin', '*');
    respHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    respHeaders.set('Access-Control-Allow-Headers', '*');
    respHeaders.set('Allow', 'GET, OPTIONS');
    respHeaders.set('Content-Type', 'application/json');

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: respHeaders });
    }

    if (request.method !== "GET") {
      return new Response(null, { status: 400, headers: respHeaders });
    }

    const results = await Promise.all(MONITORS.map(async ({
      title,
      description,
      url,
      config,
      check,
    }) => {
      const result = {
        title,
        description,
        url,
      }

      try {
        const res = await axios({
          url,
          ...config,
        });

        if (check != null) {
          try {
            result.status = check(res);
          } catch (e) {
            e.response = res;
            throw e;
          }
        } else {
          result.status = 'OK';
        }

        result.statusCode = res.status;
      } catch (e) {
        result.error = e.message;

        if (e.response) {
          result.statusCode = e.response.status;
          result.responseData = e.response.data;
        }
      }

      return result;
    }));

    const hasError = results.some(result => result.error != null);
    return new Response(JSON.stringify(results), { status: hasError ? 500 : 200, headers: respHeaders });
  }
}
