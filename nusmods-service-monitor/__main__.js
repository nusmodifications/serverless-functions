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
    url: 'https://382c4d616054428291bc86fdf4001a6e.ap-southeast-1.aws.found.io:9243/modules/_search',
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
      const { total } = res.data.hits;
      assert(total > 0, 'No data in ElasticSearch server');
      return `${total} modules`;
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
    url: 'https://nextbus.nusmods.com/arrival?busstopname=UTown'
  },
  {
    title: 'URL shortener',
    description: 'Shortens NUSMods timetable URLs',
    url: 'https://nusmods.com/short_url.php',
    config: {
      params: {
        url: 'https://nusmods.com'
      }
    },
    check: (res) => {
      assert(Boolean(res.shorturl), 'URL shortener did not return short URL');
    }
  },
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
module.exports = async (format = 'json') => {
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
  const response = {
    headers: {},
    statusCode: hasError ? 500 : 200,
  };
  
  switch (format) {
    case 'text': {
      const padTitleLength = Math.max(...results.map(r => r.title.length));
      const statusTexts = results.map(r => `${r.error == null ? '✅' : '❌'} ${r.title.padEnd(padTitleLength)} - ${r.status || r.error}`);
      
      response.headers['content-type'] = 'text/plain; charset=utf-8'
      response.body = `NUSMods Status
==============

${statusTexts.join('\n')}`;
      return response;
    }
    
    case 'json':
    default:
      response.body = JSON.stringify(results);
      response.headers['content-type'] = 'application/json';
      return response;
  }
};
