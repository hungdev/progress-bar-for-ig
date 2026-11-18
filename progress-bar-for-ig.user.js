// ==UserScript==
// @name         Progress Bar for Instagram
// @namespace    https://github.com/usyless/progress-bar-for-ig
// @version      1.2.9
// @description  Adds progress bars and volume bars to videos on Instagram
// @author       usy
// @homepageURL  https://github.com/usyless/progress-bar-for-ig
// @license      GPL-3.0
// @match        https://www.instagram.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_addValueChangeListener
// ==/UserScript==

(() => {
    'use strict';

    GM_addStyle(`
.usy-show-bar-on-any-hover [data-instancekey]:has(> :first-child:hover) .usy-progress-bar {
    height: 6px;
    opacity: 1;

    &::after {
        opacity: 0.2;
        height: 6px;
    }
}

.usy-show-bar-on-any-hover [data-instancekey]:has(> :first-child:hover) .usy-progress-bar-container {
    background: linear-gradient(to bottom, transparent, #00000066);

    &::after {
        opacity: 1;
    }
}

.usy-progress-bar-container {
    box-sizing: border-box;
    border-width: 0;

    overflow-y: visible;
    overflow-x: clip;

    * {
        box-sizing: border-box;
    }

    position: absolute;
    bottom: 0;
    min-height: 15px;
    height: 15px;
    max-height: 15px;
    cursor: pointer;
    width: 100%;
    z-index: 9999999999999;

    &:hover .usy-progress-bar, .usy-progress-bar.usy-holding {
        height: 6px;
        opacity: 1;

        &::after {
            opacity: 0.2;
            height: 6px;
        }
    }

    &:hover, &:has(.usy-progress-bar.usy-holding) {
        background: linear-gradient(to bottom, transparent, #00000066);

        &::after {
            opacity: 1;
        }
    }

    &:not(:hover) .usy-progress-bar-hidden:not(.usy-holding) {
        opacity: 0;
    }

    &::after {
        pointer-events: none;
        user-select: none;
        content: var(--time, "0:00/0:00");
        color: white;
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        bottom: 30px;
        z-index: 100;
        font-size: 32px;
        font-weight: bold;
        text-shadow: 0 0 20px black;
        opacity: 0;
        transition: 0.2s;
    }

    &.no-progress::after {
        display: none !important;
    }

    .usy-progress-bar {
        position: absolute;
        bottom: 0;
        left: 0;
        min-height: 3px;
        height: 3px;
        max-height: 6px;
        width: 0;
        z-index: 9999;
        background-color: white;
        transition: width var(--remainingTime, 0s) linear, height 0.2s, opacity 0.2s, border 0.2s;

        border-width: 0;
        border-style: solid;
        border-top-right-radius: 3px;
        border-bottom-right-radius: 3px;

        opacity: 0.4;

        &::after {
            content: "";
            width: 100vw;
            background-color: white;
            opacity: 0;
            min-height: 3px;
            height: 3px;
            max-height: 6px;
            position: absolute;
            bottom: 0;
            pointer-events: none;
            transition: height 0.2s, opacity 0.2s;
        }

        &.usy-holding, &.usy-holding::after {
            transition: width 0s, height 0.2s, opacity 0.2s;
        }
    }
}

.usy-volume-bar-button {
    overflow-x: visible !important;
    overflow-y: visible !important;

    .usy-volume-bar-container {
        --usyWidth: 100px;
        --usyHeight: 5px;
        --right-space: 10px;
        --click-margin: 10px;

        position: absolute;
        left: calc(-1 * var(--usyWidth) - var(--right-space));
        width: var(--usyWidth);
        height: calc(var(--usyHeight) + var(--click-margin));

        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;

        .usy-volume-bar, .usy-volume-bar::before {
            opacity: 0;
            transition: opacity 0.2s;
            position: absolute;
            left: 0;
            width: var(--usyWidth);
            height: var(--usyHeight);
            background: white;
            box-shadow: 0 0 5px rgba(0, 0, 0, 0.6);
            border-radius: 3px;
            border: solid 0 transparent;
        }

        .usy-volume-bar::before {
            content: "";
        }
    }

    .usy-volume-bar-container:hover .usy-volume-bar,
    &:hover .usy-volume-bar, .usy-volume-bar.usy-holding {
        opacity: 1;

        &::before {
            opacity: 0.2;
        }
    }
}
`);

    const Settings = {
        preferences: {
            show_bar: true,
            show_progress: true,
            show_bar_on_any_hover: false,
            show_volume: true,
            prevent_extra_menus: false,
            custom_like_key: ''
        },

        video_status: {
            volume: 1.0,
        },

        loadSettings: async (settings) => {
            for (const setting of settings) {
                Settings[setting] = {...Settings[setting], ...GM_getValue(setting, {})};
            }
        },

        loadAllSettings: () => Settings.loadSettings(['preferences', 'video_status']),

        updateVideoStatus: async () => GM_setValue('video_status', Settings.video_status),
    };

    const formatTime = (time) => {
        time = parseInt(time);
        return `${Math.floor(time / 60).toString()}:${(time % 60).toString().padStart(2, '0')}`;
    };

    const inViewport = (e) => {
        const rect = e.getBoundingClientRect();
        return rect.top >= 0 && rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    };

    let onReels = location.pathname.includes('/reels/');

    /** @type {Set<HTMLElement>} */
    let progress_bar_containers = new Set();

    let isInternalVolumeChange = false;
    const disableInternalVolumeChange = () =>{
        isInternalVolumeChange = false;
    };

    /**
     * @param {Event} e
     */
    const preventAll = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
    };

    /**
     * @param {HTMLElement} element
     * @returns {boolean}
     */
    const checkCenterHitTest = (element) => {
        const {left, top, width, height} = element.getBoundingClientRect();
        const topElement = document.elementFromPoint(left + width / 2, top + height / 2);
        return Boolean(topElement === element || element.contains(topElement));
    }

    const Video = {
        /** @param {HTMLElement} parent */
        addProgressBar: (parent) => {
            const holding_element = parent.querySelector('[data-instancekey]');
            const reel = parent.querySelector('video');

            if (!holding_element || !reel) return;

            const reel_identifier = reel.getAttribute('usy-pbfig-identifier');
            const pb_identifier = holding_element.querySelector('.usy-progress-bar-container')?.getAttribute('usy-pbfig-identifier');

            if ((reel_identifier && pb_identifier) && (reel_identifier === pb_identifier)) return;

            for (const c of holding_element.querySelectorAll('.usy-progress-bar-container')) c.remove();
            let holding = false, duration;

            const identifier = Math.random().toString(36).slice(2);
            reel.setAttribute('usy-pbfig-identifier', identifier);

            const barBoxContainer = document.createElement('div');
            barBoxContainer.classList.add('usy-progress-bar-container');
            barBoxContainer.setAttribute('usy-pbfig-identifier', identifier);

            const bar = document.createElement('div');
            bar.classList.add('usy-progress-bar');
            if (!Settings.preferences.show_bar) bar.classList.add('usy-progress-bar-hidden');
            if (!Settings.preferences.show_progress) barBoxContainer.classList.add('no-progress');
            barBoxContainer.appendChild(bar);
            const setWidth = () => bar.style.width = `${(reel.currentTime / duration) * 100}%`;
            holding_element.appendChild(barBoxContainer);
            progress_bar_containers.add(barBoxContainer);

            const initVolume = () => {
                if (Settings.preferences.show_volume) {
                    isInternalVolumeChange = true;
                    reel.volume = Settings.video_status.volume;
                    setTimeout(disableInternalVolumeChange, 0);
                }
            };

            const init = () => {
                if (duration) {
                    barBoxContainer.style.setProperty('--time', `"${formatTime(reel.currentTime)}/${formatTime(duration)}"`);
                    if (!holding && !reel.paused) {
                        bar.style.setProperty('--remainingTime', `${duration - reel.currentTime}s`);
                        bar.style.width = '100%';
                    }
                }
            }

            const onPauseEnd = () => {
                bar.style.setProperty('--remainingTime', '0s');
                setWidth();
                void(bar.offsetHeight);
            };

            {
                const initialiseDuration = () => {
                    duration = reel.duration;
                    setWidth();
                    initVolume();
                };
                if (reel.readyState >= 1) initialiseDuration();
                else reel.addEventListener('loadedmetadata', initialiseDuration, {once: true});
            }

            reel.addEventListener('ended', onPauseEnd);
            reel.addEventListener('play', init);
            reel.addEventListener('pause', onPauseEnd);
            reel.addEventListener('timeupdate', init);

            reel.addEventListener('volumechange', () => {
                if (isInternalVolumeChange) return;
                Video.updateGlobalVolume(reel.volume);
            });

            const updateBarFromMouse = (e) => {
                const box = barBoxContainer.getBoundingClientRect();
                reel.currentTime = Math.max(0, Math.min(((e.clientX - box.left) / box.width) * duration, duration));
                setWidth();
                if (!holding) bar.classList.remove('usy-holding');
            }

            let pauseTimeout = null;
            let paused = false;
            const pauseReel = reel.pause.bind(reel);
            const moveListener = (e) => {
                preventAll(e);
                updateBarFromMouse(e);
            }
            const stopHold = (e) => {
                preventAll(e);
                clearTimeout(pauseTimeout);
                document.removeEventListener('pointermove', moveListener);
                if (!paused) {
                    void reel.play();
                    if (!reel.paused) init();
                }
                holding = false;
                updateBarFromMouse(e);
            }
            barBoxContainer.addEventListener('pointerdown', (e) => {
                preventAll(e);
                document.removeEventListener('pointermove', moveListener);
                document.removeEventListener('pointerup', stopHold);
                paused = reel.paused;
                if (!paused) pauseTimeout = setTimeout(pauseReel, 150);
                bar.classList.add('usy-holding');
                holding = true;
                updateBarFromMouse(e);
                document.addEventListener('pointerup', stopHold, {once: true});
                document.addEventListener('pointermove', moveListener);
            });
            barBoxContainer.addEventListener('click', preventAll);

            barBoxContainer.__fix_progress_bar = () => {
                onPauseEnd();
                init();
            };
        },

        fixProgressBars: () => {
            for (const bar of progress_bar_containers) {
                if (bar.isConnected) bar.__fix_progress_bar?.();
                else progress_bar_containers.delete(bar);
            }
        },

        /** @param {HTMLElement} mute_button */
        addVolumeBar: (mute_button) => {
            if (mute_button.closest('[role="slider"][aria-valuemin][aria-valuemax][aria-valuenow]')) return;

            for (const c of mute_button.parentElement.querySelectorAll('.usy-volume-bar-container')) c.remove();
            mute_button.classList.add('usy-volume-bar-button');

            const volumeBarContainer = document.createElement('div');
            volumeBarContainer.classList.add('usy-volume-bar-container');
            const volumeBar = document.createElement('div');
            volumeBar.classList.add('usy-volume-bar');
            volumeBarContainer.appendChild(volumeBar);
            volumeBar.style.width = `${Settings.video_status.volume * 100}%`;

            const updateVolume = (e) => {
                const {left, width} = volumeBarContainer.getBoundingClientRect();
                const volume = Math.max(0, Math.min((e.clientX - left) / width, 1.0));
                volumeBar.style.width = `${volume * 100}%`;
                Video.updateGlobalVolume(volume);
            }

            const moveListener = (e) => {
                e.preventDefault();
                updateVolume(e);
            }
            const stopHold = (e) => {
                e.preventDefault();
                document.removeEventListener('pointermove', moveListener);
                volumeBar.classList.remove('usy-holding');
            }

            volumeBarContainer.addEventListener('click', preventAll);

            volumeBarContainer.addEventListener('pointerdown', (e) => {
                if (!checkCenterHitTest(volumeBarContainer)) return;

                preventAll(e);

                volumeBar.classList.add('usy-holding');
                document.addEventListener('pointermove', moveListener);
                document.addEventListener('pointerup', stopHold, {once: true});
                updateVolume(e);
            });

            mute_button.prepend(volumeBarContainer);
        },

        /**
         * @type {(volume: Number) => void}
         */
        updateGlobalVolume: (() => {
            let latestVolume;
            let ticking = false;

            const cb = () => {
                const volume_attr = `${latestVolume * 100}%`;
                isInternalVolumeChange = true;
                for (const elem of document.querySelectorAll('video, .usy-volume-bar')) {
                    if (elem.nodeName === 'VIDEO') elem.volume = latestVolume;
                    else elem.style.width = volume_attr;
                }
                setTimeout(disableInternalVolumeChange, 0);
                if (Settings.video_status.volume !== latestVolume) {
                    Settings.video_status.volume = latestVolume;
                    void Settings.updateVideoStatus();
                }
                ticking = false;
            };

            return (volume) => {
                latestVolume = volume;
                if (ticking) return;
                ticking = true;
                setTimeout(cb, 200);
            };
        })(),

        /**
         * @param {HTMLElement} e
         * @returns {HTMLElement | null}
         */
        getClosestReelContainer: (e) => e.closest('div.x78zum5.xedcshv'),

        /**
         * @type {(reel: HTMLElement) => void}
         */
        preventExtraMenus: (() => {
            /**
             * @param {MouseEvent} e
             */
            const cb = (e) => {
                preventAll(e);

                e.currentTarget.parentElement.firstElementChild.firstElementChild.firstElementChild.click();
            };
            return (reel) => {
                Video.getClosestReelContainer(reel)?.nextElementSibling?.firstElementChild?.lastElementChild?.addEventListener?.('click', cb, {capture: true});
            }
        })(),

        likeVideo: (reel) => {
            Video.getClosestReelContainer(reel)?.nextElementSibling?.firstElementChild?.firstElementChild?.firstElementChild?.firstElementChild?.click?.();
        },

        addProgressBars: () => {
            if (Settings.preferences.show_bar_on_any_hover) {
                document.documentElement?.classList?.add?.('usy-show-bar-on-any-hover');
            } else {
                document.documentElement?.classList?.remove?.('usy-show-bar-on-any-hover');
            }

            for (const reel of document.body.querySelectorAll('*:has(> [data-instancekey]):has(video)')) {
                Video.addProgressBar(reel);
            }
            if (Settings.preferences.show_volume) {
                for (const volume of document.body.querySelectorAll('[aria-label^="Audio is "]')) {
                    if (volume.parentElement.querySelector('.usy-volume-bar-container')) continue;
                    Video.addVolumeBar(volume.parentElement);
                }
            }
            if (onReels && Settings.preferences.prevent_extra_menus) {
                for (const reel of document.body.querySelectorAll('video:not([usy-prevent-extra-menu])')) {
                    reel.setAttribute('usy-prevent-extra-menu', '');
                    Video.preventExtraMenus(reel);
                }
            }
        },

        ClearAll: async () => {
            for (const reel of document.body.querySelectorAll('video[usy-prevent-extra-menu]')) {
                reel.removeAttribute('usy-prevent-extra-menu');
            }
            for (const element of document.body.querySelectorAll('.usy-volume-bar-container, .usy-progress-bar-container')) {
                element.remove();
            }
        }
    };

    const Menu = {
        toggles: [
            ['show_bar', 'Show a faint small progress bar when not hovering'],
            ['show_progress', 'Show the current video time when hovering over the progress bar'],
            ['show_bar_on_any_hover', 'Show the progress bar whenever hovering over the video'],
            ['show_volume', 'Show volume bars'],
            ['prevent_extra_menus', 'Prevent the "liked by" menu on reels'],
        ],

        ids: [],

        setPreference: (name, value) => {
            GM_setValue('preferences', {...Settings.preferences, [name]: value});
        },

        register: () => {
            for (const id of Menu.ids) GM_unregisterMenuCommand(id);
            Menu.ids = [];

            for (const [name, description] of Menu.toggles) {
                const label = `${Settings.preferences[name] ? '✅' : '⬜'} ${description}`;
                Menu.ids.push(GM_registerMenuCommand(label, () => Menu.setPreference(name, !Settings.preferences[name])));
            }

            const likeKey = Settings.preferences.custom_like_key;
            Menu.ids.push(GM_registerMenuCommand(`⌨️ Custom reel like key: ${likeKey || '(disabled)'}`, () => {
                const value = prompt('Custom reel like keybind (empty for disabled):', likeKey);
                if (value !== null) Menu.setPreference('custom_like_key', value.slice(-1));
            }));

            Menu.ids.push(GM_registerMenuCommand('⚠️ Reset to DEFAULT settings', () => {
                if (confirm('Are you sure you want to RESET this script\'s settings?')) {
                    GM_deleteValue('preferences');
                    GM_deleteValue('video_status');
                    window.location.reload();
                }
            }));
        },
    };

    setInterval(Video.fixProgressBars, 1000);

    window.addEventListener('keydown', (e) => {
        if (onReels && e.key.toLowerCase() === Settings.preferences.custom_like_key.toLowerCase()) {
            for (const reel of document.querySelectorAll('video')) {
                if (inViewport(reel)) {
                    Video.likeVideo(reel);
                    break;
                }
            }
        }
    }, {capture: true});

    {
        Video.ClearAll().then(() => {
            const observerSettings = {subtree: true, childList: true};
            const cb = (_, o) => {
                o?.disconnect();
                onReels = location.pathname.includes('/reels/');
                Video.addProgressBars();
                o?.observe(document.body, observerSettings);
            }
            Settings.loadAllSettings().then(() => {
                Menu.register();
                cb();
                (new MutationObserver(cb)).observe(document.body, observerSettings);
            });
        });
    }

    GM_addValueChangeListener('preferences', () => {
        Settings.loadSettings(['preferences']).then(Video.ClearAll).then(Video.addProgressBars).then(Menu.register);
    });

    GM_addValueChangeListener('video_status', () => {
        const current_volume = Settings.video_status.volume;
        Settings.loadSettings(['video_status']).then(() => {
            if (!Settings.preferences.show_volume) return;
            if (Settings.video_status.volume !== current_volume) Video.updateGlobalVolume(Settings.video_status.volume);
        });
    });
})();
