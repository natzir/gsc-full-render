// parse → base URLs → mark links → leave out what couldn't load → sanitise → serialise.
// Links are marked before sanitising so javascript: hrefs are recorded before neutralisation, and
// what couldn't load is matched while URLs are still as written (sanitising makes them absolute).
import { pickUrls } from './source.js';
import { markLinks } from './links.js';
import { sanitize } from './sanitize.js';
import { leaveUnloaded, leaveLazyUnrequested } from './unloaded.js';
import { PASS_THROUGH } from './render.js';

// resources: what Search Console couldn't load ({ reason, type, url }, see readUnloaded). Returns
// the full page (html), whether anything was left out of it, each resource with its effect, and
// the URLs of lazy images that never loaded.
export function prepareHtml(html, inspectedUrl, policy = PASS_THROUGH, resources = []) {
  const doc = new DOMParser().parseFromString(policy.createHTML(html), 'text/html');
  const { documentUrl, baseUrl, googlebotUrl } = pickUrls(doc, inspectedUrl);
  const { links } = markLinks(doc, baseUrl, documentUrl, inspectedUrl || documentUrl);
  const effects = leaveUnloaded(doc, resources, baseUrl, googlebotUrl);
  const { lazy } = sanitize(doc, baseUrl);
  const unrequested = leaveLazyUnrequested(lazy, baseUrl);
  return {
    html: serialize(doc),
    leftOut: effects.includes('shown') || unrequested.length > 0,
    unloaded: resources.map((resource, index) => ({ ...resource, effect: effects[index] })),
    lazy: unrequested,
    baseUrl,
    documentUrl,
    links,
  };
}

function serialize(doc) {
  const doctype = doc.doctype ? new XMLSerializer().serializeToString(doc.doctype) : '';
  return doctype + doc.documentElement.outerHTML;
}
