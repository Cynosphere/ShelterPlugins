const {
  observeDom,
  util: {reactFiberWalker, getFiber, log},
  flux: {
    storesFlat: {SelectedChannelStore},
  },
  constants: {AnalyticEvents},
} = shelter;

let unobsResults;
shelter.plugin.scoped.flux.subscribe("TRACK", (data) => {
  if (
    data.event === AnalyticEvents.SEARCH_RESULT_VIEWED &&
    data.properties.search_type === "GIF"
  ) {
    const unobsText = observeDom(
      `[class*="slateTextArea_"][role="textbox"]`,
      (elemText) => {
        unobsText();

        const insertText =
          getFiber(elemText).pendingProps.children.props.node.insertText;

        unobsResults = observeDom(
          `#gif-picker-tab-panel [class^="results_"] [class^="result_"]:not([data-giftotextbox])`,
          (result) => {
            result.dataset.giftotextbox = 1;

            const resultFiber = getFiber(result);
            const itemFiber = reactFiberWalker(resultFiber, "item", true);
            const onSelectGIF = reactFiberWalker(
              resultFiber,
              "onSelectGIF",
              true
            ).pendingProps.onSelectGIF;
            const item = itemFiber.pendingProps.item;
            const oldOnClick = itemFiber.pendingProps.onClick;
            itemFiber.pendingProps.onClick = function () {
              try {
                insertText(item.url);
                onSelectGIF({url: ""});
              } catch (err) {
                log(["Failed to insert GIF into textbox:", err]);
                oldOnClick.apply(this, arguments);
              }
            };
          }
        );
      }
    );
    setTimeout(unobsText, 1000);
  } else if (
    data.event === AnalyticEvents.SEARCH_STARTED &&
    data.properties.search_type === "GIF"
  ) {
    unobsResults?.();
  }
});

shelter.plugin.scoped.flux.subscribe("GIF_PICKER_QUERY", (data) => {
  if (data.query === "") {
    setTimeout(() => {
      if (!document.getElementById("gif-picker-tab-panel")) {
        unobsResults?.();
      }
    }, 100);
  }
});
