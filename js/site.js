const navToggle = document.querySelector('.nav-toggle');
const siteNav = document.querySelector('.site-nav');
const themeToggle = document.querySelector('.theme-toggle');
const themeStatus = document.querySelector('#theme-status');
const themeStorageKey = 'care-heard-theme';

if (themeToggle) {
    function setTheme(theme) {
        const isBrickworks = theme === 'brickworks';
        document.documentElement.dataset.theme = isBrickworks ? 'brickworks' : 'care-heard';
        themeToggle.textContent = isBrickworks ? 'Return to green palette' : 'Use red attention palette';
        themeToggle.setAttribute('aria-pressed', String(isBrickworks));
    }

    try {
        const savedTheme = localStorage.getItem(themeStorageKey);
        setTheme(savedTheme === 'brickworks' ? 'brickworks' : 'care-heard');
    } catch (error) {
        setTheme('care-heard');
        themeStatus.textContent = `Theme preference could not be loaded: ${error.message}`;
    }

    themeToggle.addEventListener('click', () => {
        const nextTheme = document.documentElement.dataset.theme === 'brickworks' ? 'care-heard' : 'brickworks';
        setTheme(nextTheme);

        try {
            localStorage.setItem(themeStorageKey, nextTheme);
            themeStatus.textContent = '';
        } catch (error) {
            themeStatus.textContent = `Theme changed for this page, but could not be saved: ${error.message}`;
        }
    });
}

if (navToggle && siteNav) {
    navToggle.addEventListener('click', () => {
        const isOpen = siteNav.classList.toggle('is-open');
        navToggle.setAttribute('aria-expanded', String(isOpen));
        navToggle.querySelector('.sr-only').textContent = isOpen ? 'Close navigation' : 'Open navigation';
    });

    siteNav.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', () => {
            siteNav.classList.remove('is-open');
            navToggle.setAttribute('aria-expanded', 'false');
            navToggle.querySelector('.sr-only').textContent = 'Open navigation';
        });
    });
}

const voiceTools = document.querySelectorAll('.voice-tools');

if (voiceTools.length) {
    let activeSpeechButton = null;
    const speechSupported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

    function resetSpeechButton(button) {
        button.textContent = 'Listen to text';
        button.setAttribute('aria-pressed', 'false');
    }

    voiceTools.forEach((tools) => {
        const article = tools.closest('.journal-card');
        const readButton = tools.querySelector('.voice-read-button');
        const fileInput = tools.querySelector('.voice-file-input');
        const audioPlayer = tools.querySelector('.voice-audio');
        const status = tools.querySelector('.voice-status');
        let recordingUrl = null;

        if (speechSupported) {
            readButton.addEventListener('click', () => {
                if (activeSpeechButton === readButton) {
                    window.speechSynthesis.cancel();
                    resetSpeechButton(readButton);
                    activeSpeechButton = null;
                    status.textContent = 'Read-aloud stopped.';
                    return;
                }

                if (activeSpeechButton) {
                    resetSpeechButton(activeSpeechButton);
                    window.speechSynthesis.cancel();
                }

                const title = article.querySelector('.card-body h3').textContent.trim();
                const paragraphs = [...article.querySelectorAll('.card-body > p:not(.post-meta):not(.article-note)')]
                    .map((paragraph) => paragraph.textContent.trim());
                const speech = new SpeechSynthesisUtterance([title, ...paragraphs].join('. '));
                speech.lang = document.documentElement.lang || 'en';
                speech.onstart = () => {
                    readButton.textContent = 'Stop reading';
                    readButton.setAttribute('aria-pressed', 'true');
                    activeSpeechButton = readButton;
                    status.textContent = 'Reading this post aloud.';
                };
                speech.onend = () => {
                    resetSpeechButton(readButton);
                    if (activeSpeechButton === readButton) activeSpeechButton = null;
                    status.textContent = 'Finished reading this post.';
                };
                speech.onerror = (event) => {
                    resetSpeechButton(readButton);
                    if (activeSpeechButton === readButton) activeSpeechButton = null;
                    if (event.error !== 'canceled' && event.error !== 'interrupted') {
                        status.textContent = `Read-aloud failed: ${event.error}. You can choose a voice recording instead.`;
                    }
                };

                try {
                    window.speechSynthesis.speak(speech);
                } catch (error) {
                    resetSpeechButton(readButton);
                    activeSpeechButton = null;
                    status.textContent = `Read-aloud could not start: ${error.message}`;
                }
            });
        } else {
            readButton.disabled = true;
            status.textContent = 'Read-aloud is not supported by this browser. You can still choose a voice recording to play.';
        }

        fileInput.addEventListener('change', () => {
            const file = fileInput.files[0];
            if (!file) return;

            if (file.type && !file.type.startsWith('audio/')) {
                status.textContent = 'Please choose an audio file.';
                fileInput.value = '';
                return;
            }

            if (recordingUrl) URL.revokeObjectURL(recordingUrl);
            recordingUrl = URL.createObjectURL(file);
            audioPlayer.src = recordingUrl;
            audioPlayer.hidden = false;
            status.textContent = `Ready to play “${file.name}”. The recording stays on your device and is not uploaded.`;
        });
    });

    window.addEventListener('pagehide', () => {
        voiceTools.forEach((tools) => {
            if (tools.querySelector('.voice-audio').src.startsWith('blob:')) {
                URL.revokeObjectURL(tools.querySelector('.voice-audio').src);
            }
        });
        if (speechSupported) window.speechSynthesis.cancel();
    }, { once: true });
}

const guestForm = document.querySelector('#guest-form');

if (guestForm) {
    const storyField = guestForm.elements.story;
    const wordCount = document.querySelector('#word-count');
    const feedback = document.querySelector('#form-feedback');
    const postList = document.querySelector('#community-posts');
    const submitButton = guestForm.querySelector('[type="submit"]');
    const wordLimit = 500;
    const storageKey = 'care-heard-guest-post';

    function countWords(text) {
        const trimmed = text.trim();
        return trimmed ? trimmed.split(/\s+/u).length : 0;
    }

    function showFeedback(message, isError) {
        feedback.textContent = message;
        feedback.classList.toggle('is-error', isError);
    }

    function renderPost(post) {
        postList.replaceChildren();
        const article = document.createElement('article');
        article.className = 'guest-post';

        const meta = document.createElement('div');
        meta.className = 'guest-post-meta';
        const topic = document.createElement('span');
        topic.textContent = post.topic;
        const author = document.createElement('span');
        author.textContent = post.name;
        meta.append(topic, author);

        const title = document.createElement('h3');
        title.textContent = post.title;
        const story = document.createElement('p');
        story.textContent = post.story;

        article.append(meta, title, story);
        postList.append(article);
    }

    function loadSavedPost() {
        const saved = localStorage.getItem(storageKey);
        if (!saved) return;

        const post = JSON.parse(saved);
        if (!post || typeof post !== 'object' ||
            typeof post.name !== 'string' ||
            typeof post.title !== 'string' ||
            typeof post.story !== 'string' ||
            typeof post.topic !== 'string') {
            throw new Error('The saved guest post has an unexpected format.');
        }

        renderPost(post);
        guestForm.querySelectorAll('input, select, textarea, button').forEach((field) => {
            field.disabled = true;
        });
        showFeedback('One guest post has already been saved in this browser.', false);
    }

    function updateWordCount() {
        const words = countWords(storyField.value);
        wordCount.textContent = `${words} / ${wordLimit} words`;
        wordCount.classList.toggle('is-over-limit', words > wordLimit);
    }

    storyField.addEventListener('input', updateWordCount);

    try {
        loadSavedPost();
    } catch (error) {
        submitButton.disabled = true;
        showFeedback(`Community storage is unavailable: ${error.message}`, true);
    }

    guestForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const words = countWords(storyField.value);

        if (words > wordLimit) {
            const overage = words - wordLimit;
            showFeedback(`Your post is ${overage} word${overage === 1 ? '' : 's'} over the one-page limit. Please shorten it to 500 words or fewer.`, true);
            return;
        }

        const post = {
            name: guestForm.elements.name.value.trim(),
            topic: guestForm.elements.topic.value,
            title: guestForm.elements.title.value.trim(),
            story: storyField.value.trim()
        };

        try {
            if (localStorage.getItem(storageKey)) {
                loadSavedPost();
                showFeedback('A guest post is already saved in this browser.', true);
                return;
            }

            localStorage.setItem(storageKey, JSON.stringify(post));
            renderPost(post);
            guestForm.querySelectorAll('input, select, textarea, button').forEach((field) => {
                field.disabled = true;
            });
            showFeedback('Your post is saved in this browser. It has not been sent to a server or shared with other visitors.', false);
        } catch (error) {
            showFeedback(`Your post could not be saved: ${error.message}`, true);
        }
    });

    updateWordCount();
}
