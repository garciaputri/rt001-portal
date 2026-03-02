/**
 * Netlify Function: /api/gas
 * Proxy ke Google Apps Script untuk bypass CORS.
 * Portal fetch ke /api/gas (same domain) → function forward ke GAS.
 */

const GAS_URL = 'https://script.google.com/macros/s/AKfycbyUsAIhwdwOyB2tXwq6t5wH59Cl42zZv9uWhz9weimma6qgenyYzRj44d4iwYOvNFI3/exec';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  /* Handle preflight */
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    let action = 'ping';
    let data   = {};
    let ts     = new Date().toISOString();

    /* Baca params dari GET atau POST */
    if (event.httpMethod === 'POST' && event.body) {
      const body = JSON.parse(event.body);
      action = body.action || 'ping';
      data   = body.data   || {};
      ts     = body.ts     || ts;
    } else if (event.queryStringParameters) {
      action = event.queryStringParameters.action || 'ping';
      ts     = event.queryStringParameters.ts     || ts;
      if (event.queryStringParameters.data) {
        try { data = JSON.parse(decodeURIComponent(event.queryStringParameters.data)); }
        catch(e) { data = {}; }
      }
    }

    /* Forward ke GAS via POST */
    const gasResp = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, data, ts }),
      redirect: 'follow',
    });

    const text = await gasResp.text();

    /* Validasi response JSON */
    let json;
    try { json = JSON.parse(text); }
    catch(e) { json = { status: 'error', msg: 'GAS response bukan JSON: ' + text.substring(0,100) }; }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(json),
    };

  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: 'error', msg: err.message }),
    };
  }
};
