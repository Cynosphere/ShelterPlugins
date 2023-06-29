// this is mostly a proof of concept than a final product in its current state
// this is NOWHERE near perfect as evident by the amount of events and hardcoded
// class names
//
// http stuff is also very bad and shelter should exfiltrate discord's http
// module
const {flux, solid, util} = shelter;

const blacklistedExts = [
  "mp4",
  "mov",
  "webm",
  "ogg",
  "mp3",
  "wav",
  "flac",
  "svg",
];

function encodeBase64(arrayBuffer) {
  /**
   * @license MIT
   * Copyright 2011 Jon Leighton
   */
  let base64 = "";
  const encodings =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  const bytes = new Uint8Array(arrayBuffer);
  const byteLength = bytes.byteLength;
  const byteRemainder = byteLength % 3;
  const mainLength = byteLength - byteRemainder;

  let a, b, c, d;
  let chunk;

  // Main loop deals with bytes in chunks of 3
  for (let i = 0; i < mainLength; i = i + 3) {
    // Combine the three bytes into a single integer
    chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];

    // Use bitmasks to extract 6-bit segments from the triplet
    a = (chunk & 16515072) >> 18; // 16515072 = (2^6 - 1) << 18
    b = (chunk & 258048) >> 12; // 258048   = (2^6 - 1) << 12
    c = (chunk & 4032) >> 6; // 4032     = (2^6 - 1) << 6
    d = chunk & 63; // 63       = 2^6 - 1

    // Convert the raw binary segments to the appropriate ASCII encoding
    base64 += encodings[a] + encodings[b] + encodings[c] + encodings[d];
  }

  // Deal with the remaining bytes and padding
  if (byteRemainder == 1) {
    chunk = bytes[mainLength];

    a = (chunk & 252) >> 2; // 252 = (2^6 - 1) << 2

    // Set the 4 least significant bits to zero
    b = (chunk & 3) << 4; // 3   = 2^2 - 1

    base64 += encodings[a] + encodings[b] + "==";
  } else if (byteRemainder == 2) {
    chunk = (bytes[mainLength] << 8) | bytes[mainLength + 1];

    a = (chunk & 64512) >> 10; // 64512 = (2^6 - 1) << 10
    b = (chunk & 1008) >> 4; // 1008  = (2^6 - 1) << 4

    // Set the 2 least significant bits to zero
    c = (chunk & 15) << 2; // 15    = 2^4 - 1

    base64 += encodings[a] + encodings[b] + encodings[c] + "=";
  }

  return base64;
}

async function createEmoji(guild, url, name) {
  const {GatewayConnectionStore} = flux.stores;
  // this annoyingly logs to console but this is the only way we can get super properties
  const identify = GatewayConnectionStore.getSocket().handleIdentify();

  let res;
  try {
    res = await fetch(url, {mode: "cors"});
  } catch (err) {
    util.log(["Failed to fetch emoji", url, err], "error");
    return;
  }

  if (!res) return;

  try {
    const contentType = res.headers.get("Content-Type");
    const imageB64 = encodeBase64(await res.arrayBuffer());

    flux.dispatcher.dispatch({
      type: "EMOJI_UPLOAD_START",
      guildId: guild.id,
    });

    await fetch(`${window.GLOBAL_ENV.API_ENDPOINT}/guilds/${guild.id}/emojis`, {
      method: "POST",
      body: JSON.stringify({
        image: `data:${contentType};base64,${imageB64}`,
        name,
      }),
      headers: {
        "Content-Type": "application/json",
        Authorization: identify.token,
        "X-Super-Properties": btoa(JSON.stringify(identify.properties)),
      },
    }).then(
      () => {
        flux.dispatcher.dispatch({
          type: "EMOJI_UPLOAD_STOP",
          guildId: guild.id,
        });
      },
      (err) => {
        flux.dispatcher.dispatch({
          type: "EMOJI_UPLOAD_STOP",
          guildId: guild.id,
        });
        return Promise.reject(err);
      }
    );
  } catch (err) {
    util.log(["Failed to create emoji", url, err], "error");
  }
}

function calculateEmojiSlots(guild) {
  const {EmojiStore} = flux.stores;
  const max = guild.getMaxEmojiSlots();
  const emojis = EmojiStore.getGuildEmoji(guild.id).filter((x) => !x.managed);
  const normal = emojis.filter((x) => !x.animated);
  const animated = emojis.filter((x) => x.animated);

  return {
    normal: normal.length,
    animated: animated.length,
    max,
  };
}

function createSubmenu(menuElement, itemClassName, url, name, animated) {
  const {GuildStore, SortedGuildStore, PermissionStore} = flux.stores;

  const flattenedGuilds =
    SortedGuildStore.getGuildsTree().root.children.flatMap((item) =>
      item.type == "guild" ? item : item.children
    );
  const availableGuilds = Object.values(GuildStore.getGuilds())
    .filter((guild) => PermissionStore.can(1n << 30n, guild))
    .sort((guild, guild2) => {
      const g1 = flattenedGuilds.findIndex((g) => g.id == guild.id);
      const g2 = flattenedGuilds.findIndex((g) => g.id == guild2.id);
      return g1 - g2;
    });

  const menuWrapperClassName = menuElement.parentElement.className;
  const scrollerClassName = menuElement.childNodes[0].className;

  const onmouseenter = function (event) {
    //event.target.style.color = "var(--white-500)";
    //event.target.style.backgroundColor = "var(--brand-experiment-560)";
    event.target.className = itemClassName + " focused-3LIdPu";

    menuElement.setAttribute("aria-activedescendant", event.target.id);
  };
  const onmouseleave = function (event) {
    event.target.className = itemClassName;
  };
  const noop = function () {};

  return (
    <div className={menuWrapperClassName}>
      <div className="submenuPaddingContainer-QgnL1r">
        <div className="submenu-3ycVEH menu-2TXYjN">
          <div className={scrollerClassName}>
            {availableGuilds.map((guild) => {
              const slots = calculateEmojiSlots(guild);
              const iconUrl = guild.getIconURL(24);
              const disabled = animated
                ? slots.animated >= slots.max
                : slots.normal >= slots.max;

              return (
                <div
                  className={itemClassName}
                  id={`message-create-emoji--${guild.id}`}
                  onMouseEnter={disabled ? noop : onmouseenter}
                  onMouseLeave={disabled ? noop : onmouseleave}
                  onClick={
                    disabled
                      ? noop
                      : () => {
                          createEmoji(guild, url, name);

                          flux.dispatcher.dispatch({
                            type: "CONTEXT_MENU_CLOSE",
                          });
                        }
                  }
                  style={`${disabled ? "opacity: 0.5;" : ""}`}
                >
                  <div
                    className={`iconContainerLeft- iconContainer- ${
                      disabled ? "disabled-" : ""
                    }`}
                    style={`margin-left: 0; margin-right: 8px;`}
                  >
                    <img
                      src={iconUrl}
                      width={18}
                      height={18}
                      style={`border-radius: 50%;`}
                    />
                  </div>
                  <div
                    class="label-"
                    style={`-webkit-box-flex: 1; -ms-flex: 1 1 auto; flex: 1 1 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`}
                  >
                    {guild.name}
                    <div
                      className="subtext-"
                      style={`color: var(--text-muted); font-size: 12px; line-height: 16px;`}
                    >{`${slots.normal}/${slots.max} normal, ${slots.animated}/${slots.max} animated`}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function appendContextMenuItem(menuElement, props) {
  let url = props.target.href ?? props.target.src;
  if (!url) return;
  if (url.indexOf("tenor.com/view") > -1) return;

  const isEmoji = props.target.classList.contains("emoji");
  if (isEmoji && url.indexOf("cdn.discordapp.com/emojis/") > -1) {
    const uri = new URL(url);
    const emojiId = uri.pathname.match(/(\d+)/)[1];
    const emojiInMessage = props.message.content.match(
      new RegExp("<(a)?:\\w+:" + emojiId + ">")
    );
    let animated = emojiInMessage?.[1] ?? false;

    uri.search = "";
    url = uri.href;

    url = url.replace(".webp", animated ? ".gif" : ".png");
  }

  let name = url
    .substring(url.lastIndexOf("/"), url.lastIndexOf("."))
    .replace(/[^a-zA-Z0-9_]/g, "")
    .slice(0, 32);
  for (; name.length < 2; ) name += "_";
  if (props.target.ariaLabel)
    name = props.target.ariaLabel.slice(1, -1).replace(/~\d+$/, "");

  const fileExt = url.substring(
    url.lastIndexOf(".") + 1,
    url.lastIndexOf(".") + 4
  );

  if (blacklistedExts.includes(fileExt)) return;

  const animated = props.attachment?.content_type
    ? props.attachment.content_type == "image/gif"
    : fileExt == "gif";

  const targetItem = menuElement.querySelector("[id=message-copy-native-link]");
  if (targetItem) {
    const className = targetItem.className;
    const [hovered, setHovered] = solid.createSignal(false);
    const submenu = createSubmenu(menuElement, className, url, name, animated);

    const itemEnter = function (event) {
      //event.target.style.color = "var(--white-500)";
      //event.target.style.backgroundColor = "var(--brand-experiment-560)";
      //event.target.className = className + " focused-3LIdPu";

      menuElement.setAttribute("aria-activedescendant", event.target.id);
      if (!hovered()) {
        setHovered(true);

        const prevHover = menuElement.querySelector(
          `[class*=focused-]:not([id=${event.target.id}])`
        );
        if (prevHover) {
          prevHover.className = prevHover.className.replace(/focused-\w+/, "");
        }

        const selfPos = event.target.getBoundingClientRect();

        submenu.style.position = "fixed";
        submenu.style.left = `${selfPos.x + selfPos.width + 4}px`;
        submenu.style.top = `${selfPos.y}px`;

        event.target.after(submenu);
        const submenuPos = submenu.getBoundingClientRect();
        submenu.style.top = `${
          selfPos.y + selfPos.height - submenuPos.height
        }px`;
      }
    };
    const wrapperLeave = function (event) {
      setHovered(false);
      submenu.remove();
    };
    menuElement.addEventListener("mouseleave", wrapperLeave);
    const wrapperMove = function (event) {
      const newHover = menuElement.querySelector(
        "[class*=focused-]:not([id^=message-create-emoji])"
      );
      if (newHover) {
        wrapperLeave();
      }
    };
    menuElement.addEventListener("mouseover", wrapperMove);

    const wrapper = (
      <div>
        <div
          className={className + (hovered() ? " focused-3LIdPu" : "")}
          id="message-create-emoji"
          role="menuitem"
          tabIndex={-1}
          data-menu-item="true"
          onMouseEnter={itemEnter}
        >
          <div className={targetItem.childNodes[0].className}>
            Create Emoji: {name}
          </div>
          <div className="iconContainer-Ksy8Oj">
            <svg
              className="caret-1TZU-U"
              aria-hidden={true}
              role="img"
              width={24}
              height={24}
              viewBox="0 0 24 24"
            >
              <g fill="none" fillRule="evenodd">
                <polygon
                  fill="currentColor"
                  fillRule="nonzero"
                  points="8.47 2 6.12 4.35 13.753 12 6.12 19.65 8.47 22 18.47 12"
                />
                <polygon points="0 0 24 0 24 24 0 24" />
              </g>
            </svg>
          </div>
        </div>
      </div>
    );

    targetItem.before(wrapper);

    const menuParent = menuElement.parentElement;
    menuParent.style.top = `${
      Number(menuParent.style.top.replace("px", "")) - wrapper.clientHeight
    }px`;
  }
}

const unloads = [];
export function onLoad() {
  unloads.push(
    flux.intercept((event) => {
      // this does NOT capture all context menus but captures MOST
      // the only two ive found that it doesn't call on is message actions (the
      // ... menu on messages) and guild header
      if (event.type == "CONTEXT_MENU_OPEN") {
        const menu = event.contextMenu;
        let menuProps;

        if (menu.render) {
          const oldRender = menu.render;
          menu.render = function () {
            const ret = oldRender.apply(null, arguments);
            menuProps = ret.props;
            return ret;
          };
        } else if (menu.renderLazy) {
          const oldRender = menu.renderLazy;
          menu.renderLazy = async function () {
            const ret = await oldRender.apply(null, arguments);
            return function (props) {
              const menu = ret.apply(null, arguments);
              menuProps = menu.props;
              return menu;
            };
          };
        }

        // props set next frame for async menus
        setTimeout(() => {
          // more consistent and faster than observing
          const menu = document.querySelector("div[class^=menu-][id=message]");
          if (menu) {
            try {
              appendContextMenuItem(menu, menuProps);
            } catch (err) {
              util.log(err, "error");
            }
          }
        });
      }
    })
  );
}

export function onUnload() {
  unloads.forEach((unload) => unload());
}
