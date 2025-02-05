import jQuery from "jquery";

window.$ = jQuery; // workaround for https://github.com/parcel-bundler/parcel/issues/333
import "bootstrap";
import instantsearch from "instantsearch.js/es";
import {
  searchBox,
  infiniteHits,
  configure,
  stats,
  refinementList,
  sortBy,
  currentRefinements,
} from "instantsearch.js/es/widgets";
import { history } from "instantsearch.js/es/lib/routers";

import TypesenseInstantSearchAdapter from "typesense-instantsearch-adapter";
import { SearchClient as TypesenseSearchClient } from "typesense"; // To get the total number of docs
import images from "../images/*.*";
import STOP_WORDS from "./utils/stop_words.json";

// Source: https://stackoverflow.com/a/901144/123545
const anchorParams = new Proxy(
  new URLSearchParams(window.location.hash.replace("#", "")),
  {
    get: (anchorParams, prop) => anchorParams.get(prop),
  }
);

let TYPESENSE_SERVER_CONFIG = {
  apiKey: process.env.TYPESENSE_SEARCH_ONLY_API_KEY, // Be sure to use an API key that only allows searches, in production
  nodes: [
    {
      host: anchorParams.host ? anchorParams.host : process.env.TYPESENSE_HOST,
      port: process.env.TYPESENSE_PORT,
      protocol: process.env.TYPESENSE_PROTOCOL,
    },
  ],
  numRetries: 8,
  useServerSideSearchCache: false,
};

// [2, 3].forEach(i => {
//   if (process.env[`TYPESENSE_HOST_${i}`]) {
//     TYPESENSE_SERVER_CONFIG.nodes.push({
//       host: process.env[`TYPESENSE_HOST_${i}`],
//       port: process.env.TYPESENSE_PORT,
//       protocol: process.env.TYPESENSE_PROTOCOL,
//     });
//   }
// });

// Unfortunately, dynamic process.env keys don't work with parcel.js
// So need to enumerate each key one by one

if (process.env[`TYPESENSE_HOST_2`]) {
  TYPESENSE_SERVER_CONFIG.nodes.push({
    host: anchorParams.host
      ? anchorParams.host
      : process.env[`TYPESENSE_HOST_2`],
    port: process.env.TYPESENSE_PORT,
    protocol: process.env.TYPESENSE_PROTOCOL,
  });
}

if (process.env[`TYPESENSE_HOST_3`]) {
  TYPESENSE_SERVER_CONFIG.nodes.push({
    host: anchorParams.host
      ? anchorParams.host
      : process.env[`TYPESENSE_HOST_3`],
    port: process.env.TYPESENSE_PORT,
    protocol: process.env.TYPESENSE_PROTOCOL,
  });
}

if (process.env[`TYPESENSE_HOST_NEAREST`]) {
  TYPESENSE_SERVER_CONFIG["nearestNode"] = {
    host: anchorParams.host
      ? anchorParams.host
      : process.env[`TYPESENSE_HOST_NEAREST`],
    port: process.env.TYPESENSE_PORT,
    protocol: process.env.TYPESENSE_PROTOCOL,
  };
}

const INDEX_NAME = process.env.TYPESENSE_COLLECTION_NAME;

async function getIndexSize() {
  let typesenseSearchClient = new TypesenseSearchClient({
    ...TYPESENSE_SERVER_CONFIG,
    useServerSideSearchCache: true,
  });
  let results = await typesenseSearchClient
    .collections(INDEX_NAME)
    .documents()
    .search({ q: "*" });

  return results["found"];
}

let indexSize;

(async () => {
  indexSize = await getIndexSize();
})();

function iconForUrl(url) {
  if (url.includes("amazon.com")) {
    return images["amazon_icon"]["svg"];
  } else if (url.includes("openlibrary")) {
    return images["archive_icon"]["svg"];
  } else {
    return images["generic_link_icon"]["svg"];
  }
}

function topMarginForUrl(url) {
  if (url.includes("amazon.com")) {
    return 1;
  } else {
    return 0;
  }
}

function urlsObjectsForBookObject(bookObject) {
  let urls = [];

  if (bookObject["isbn_10"]) {
    urls.push(`https://www.amazon.com/dp/${bookObject["isbn_10"]}`);
  } else if (bookObject.isbn_13) {
    urls.push(`https://www.amazon.com/s?k=${bookObject["isbn_13"]}`);
  }

  urls.push(`https://openlibrary.org${bookObject["id"]}`);

  return urls.map((u) => {
    return {
      url: u,
      icon: iconForUrl(u),
      topMargin: topMarginForUrl(u),
    };
  });
}

function queryWithoutStopWords(query) {
  const words = query.replace(/[&/\\#,+()$~%.':*?<>{}]/g, "").split(" ");
  return words
    .map((word) => {
      if (STOP_WORDS.includes(word.toLowerCase())) {
        return null;
      } else {
        return word;
      }
    })
    .filter((w) => w)
    .join(" ")
    .trim();
}

const typesenseInstantsearchAdapter = new TypesenseInstantSearchAdapter({
  server: TYPESENSE_SERVER_CONFIG,
  // The following parameters are directly passed to Typesense's search API endpoint.
  //  So you can pass any parameters supported by the search endpoint below.
  //  queryBy is required.
  additionalSearchParameters: {
    query_by: "author,title",
    facet_sample_threshold: 1000,
    facet_sample_percent: 20,
  },
});
const searchClient = typesenseInstantsearchAdapter.searchClient;

const search = instantsearch({
  searchClient,
  indexName: INDEX_NAME,
  routing: {
    router: history({ cleanUrlOnDispose: true }),
  },
  onStateChange({ uiState, setUiState }) {
    if (uiState[INDEX_NAME].query === "") {
      $("#results-section").addClass("d-none");
    } else {
      $("#results-section").removeClass("d-none");
      setUiState(uiState);
    }
  },
  future: {
    preserveSharedStateOnUnmount: true,
  },
});

const analyticsMiddleware = () => {
  return {
    onStateChange() {
      window.ga(
        "set",
        "page",
        (window.location.pathname + window.location.search).toLowerCase()
      );
      window.ga("send", "pageView");
    },
    subscribe() {},
    unsubscribe() {},
  };
};

search.use(analyticsMiddleware);

let debounceTimerId;

search.addWidgets([
  searchBox({
    container: "#searchbox",
    showSubmit: false,
    showReset: false,
    placeholder: "Type in a book title or author",
    autofocus: true,
    cssClasses: {
      input: "form-control searchbox-input",
    },
    queryHook(query, search) {
      const modifiedQuery = queryWithoutStopWords(query);
      if (modifiedQuery.trim() !== "" && modifiedQuery.trim().length > 2) {
        if (debounceTimerId) {
          clearTimeout(debounceTimerId);
        }
        debounceTimerId = setTimeout(() => search(modifiedQuery), 250);
      }
    },
  }),

  stats({
    container: "#stats",
    templates: {
      text: ({ nbHits, hasNoResults, hasOneResult, processingTimeMS }) => {
        let statsText = "";
        if (hasNoResults) {
          statsText = "No results";
        } else if (hasOneResult) {
          statsText = "1 result";
        } else {
          statsText = `✨ ${nbHits.toLocaleString()} results`;
        }
        return `${statsText} found ${
          indexSize ? ` - Searched ${indexSize.toLocaleString()} books` : ""
        } in ${processingTimeMS}ms.`;
      },
    },
  }),
  infiniteHits({
    container: "#hits",
    cssClasses: {
      list: "list-unstyled grid-container",
      item: "d-flex flex-column search-result-card bg-light-2 p-3",
      loadMore: "btn btn-primary mx-auto d-block mt-4",
    },
    templates: {
      item: (hit, { html, components }) => html`
        <h6 class="text-primary fw-light font-letter-spacing-loose mb-0">
          <a href="https://openlibrary.org/${hit.id}" target="_blank">
            ${components.Highlight({ hit, attribute: "title" })}
          </a>
        </h6>
        <div class="text-muted">
          by ${" "}
          <a role="button" class="clickable-search-term">
            ${components.Highlight({ hit, attribute: "author" })}
          </a>
        </div>
        <div class="mt-auto text-end">
          ${hit.urls.map(
            (item) =>
              html` <a class="ms-2" href="${item.url}" target="_blank"
                ><img
                  class="mt-${item.topMargin}"
                  src="${item.icon}"
                  alt="${item.type}"
                  height="14"
              /></a>`
          )}
        </div>
      `,
      empty: (state, { html }) =>
        html`No books found for <q>${state.query}</q>. Try another search term.`,
    },
    transformItems: (items) => {
      return items.map((item) => {
        return {
          ...item,
          urls: urlsObjectsForBookObject(item),
        };
      });
    },
  }),
  refinementList({
    container: "#author-refinement-list",
    attribute: "author",
    searchable: true,
    searchablePlaceholder: "Search authors",
    showMore: true,
    showMoreLimit: 40,
    cssClasses: {
      searchableInput: "form-control form-control-sm mb-2 border-light-2",
      searchableSubmit: "d-none",
      searchableReset: "d-none",
      showMore: "btn btn-secondary btn-sm align-content-center",
      list: "list-unstyled",
      count: "badge bg-light text-bg-light ms-2",
      label: "d-flex align-items-center text-capitalize mb-2",
      checkbox: "me-2",
    },
  }),
  refinementList({
    container: "#subjects-refinement-list",
    attribute: "subjects",
    searchable: true,
    searchablePlaceholder: "Search subjects",
    showMore: true,
    showMoreLimit: 40,
    cssClasses: {
      searchableInput: "form-control form-control-sm mb-2 border-light-2",
      searchableSubmit: "d-none",
      searchableReset: "d-none",
      showMore: "btn btn-secondary btn-sm align-content-center",
      list: "list-unstyled",
      count: "badge bg-light text-bg-light ms-2",
      label: "d-flex align-items-center text-capitalize mb-2",
      checkbox: "me-2",
    },
  }),
  sortBy({
    container: "#sort-by",
    items: [
      { label: "Recent first", value: `${INDEX_NAME}` },
      { label: "Oldest first", value: `${INDEX_NAME}/sort/publish_date:asc` },
    ],
    cssClasses: {
      select: "form-select form-select-sm",
    },
  }),
  configure({
    hitsPerPage: 15,
  }),
  currentRefinements({
    container: "#current-refinements",
    cssClasses: {
      list: "list-unstyled",
      label: "d-none",
      item: "h5",
      category: "badge bg-light text-bg-light px-3 m-2",
      categoryLabel: "text-capitalize",
      delete: "btn btn-sm btn-link p-0 ps-2",
    },
    transformItems: (items) => {
      const modifiedItems = items.map((item) => {
        return {
          ...item,
          label: "",
        };
      });
      return modifiedItems;
    },
  }),
]);

function handleSearchTermClick(event) {
  const $searchBox = $("#searchbox input[type=search]");
  search.helper.clearRefinements();
  $searchBox.val(event.currentTarget.textContent);
  search.helper.setQuery($searchBox.val()).search();
}

search.on("render", function () {
  // Make author names clickable
  $("#hits .clickable-search-term").on("click", handleSearchTermClick);

  // Read directions button
  $(".readDirectionsButton").on("click", (event) => {
    $(event.currentTarget).parent().siblings().first().modal("show");
  });
});

search.start();

$(function () {
  const $searchBox = $("#searchbox input[type=search]");
  // Search on page refresh with the query restored from URL params
  if ($searchBox.val().trim() !== "") {
    search.helper.setQuery($searchBox.val()).search();
  }

  // Handle example search terms
  $(".clickable-search-term").on("click", handleSearchTermClick);

  // Clear refinements, when searching
  $searchBox.on("keydown", () => {
    search.helper.clearRefinements();
  });

  if (!matchMedia("(min-width: 768px)").matches) {
    $searchBox.on("focus, keydown", () => {
      $("html, body").animate(
        {
          scrollTop: $("#searchbox-container").offset().top,
        },
        500
      );
    });
  }
});
