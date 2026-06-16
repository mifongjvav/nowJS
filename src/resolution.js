export const RESOLUTIONS = {
    "720p": { width: 1280, height: 720 },
    "1080p": { width: 1920, height: 1080 },
    "2k": { width: 2560, height: 1440 },
    "4k": { width: 3840, height: 2160 },
};

export function showResolutionSelector() {
    return new Promise((resolve) => {
        const container = document.createElement("div");
        container.id = "resolution-selector";
        container.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(51, 51, 51, 0.95);
            padding: 40px;
            border-radius: 15px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.8);
            z-index: 10000;
            text-align: center;
            font-family: Arial, sans-serif;
            color: white;
            min-width: 300px;
        `;

        const title = document.createElement("h2");
        title.textContent = "选择分辨率";
        title.style.marginBottom = "20px";

        const select = document.createElement("select");
        select.style.cssText = `
            padding: 12px 20px;
            font-size: 18px;
            border-radius: 8px;
            border: none;
            background: #555;
            color: white;
            cursor: pointer;
            margin-bottom: 20px;
            width: 100%;
            box-sizing: border-box;
        `;

        Object.keys(RESOLUTIONS).forEach((key) => {
            const option = document.createElement("option");
            option.value = key;
            option.textContent = `${key.toUpperCase()} (${RESOLUTIONS[key].width}x${RESOLUTIONS[key].height})`;
            select.appendChild(option);
        });

        const savedResolution =
            localStorage.getItem("gameResolution") || "720p";
        select.value = savedResolution;

        const button = document.createElement("button");
        button.textContent = "确认";
        button.style.cssText = `
            padding: 12px 30px;
            font-size: 18px;
            border-radius: 8px;
            border: none;
            background: #007bff;
            color: white;
            cursor: pointer;
            transition: background 0.3s;
        `;
        button.onmouseover = () => (button.style.background = "#0056b3");
        button.onmouseout = () => (button.style.background = "#007bff");

        button.onclick = () => {
            const selected = select.value;
            localStorage.setItem("gameResolution", selected);
            resolve(RESOLUTIONS[selected]);
            document.body.removeChild(container);
        };

        container.appendChild(title);
        container.appendChild(select);
        container.appendChild(button);
        document.body.appendChild(container);

        select.focus();
    });
}

export function getSavedResolution() {
    const saved = localStorage.getItem("gameResolution") || "720p";
    return RESOLUTIONS[saved];
}
