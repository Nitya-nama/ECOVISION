(() => {
    // PARAMETERS AND ALGORITHMS
    const PARAMETERS = [
        "life_expectancy",
        "hdi_index",
        "co2_consump",
        "gdp",
        "services",
        "trade_percent_gdp",
        "pv_est",
        "inflation",
        "service_workers_percent",
        "hdi_full",
        "lex",
        "gdp_per_capita",
        "co2_pcap_cons"
    ];

    const PARAM_LABELS = {
        "life_expectancy": "Life Expectancy",
        "hdi_index": "Human Development Index",
        "co2_consump": "CO2 Consumption",
        "gdp": "GDP",
        "services": "Services (% GDP)",
        "trade_percent_gdp": "Trade (% GDP)",
        "pv_est": "Photovoltaic Energy",
        "inflation": "Inflation Rate",
        "service_workers_percent": "Service Sector Workers (%)",
        "hdi_full": "Full Human Development Index",
        "lex": "Life Expectancy at Birth",
        "gdp_per_capita": "GDP Per Capita",
        "co2_pcap_cons": "CO2 Per Capita Consumption"
    };


    const ALGORITHMS = [
        { key: "decision_tree", name: "Decision Tree" },
        { key: "svm", name: "SVM" },
        { key: "polynomial_reg", name: "Polynomial Regression" },
        { key: "random_forest", name: "Random Forest" }
    ];

    const VIZ_OPTIONS_MAP = {
        decision_tree: {
            1: ["Bar Graph", "Line Chart", "Area Chart", "Scatter Plot"],
            2: ["Grouped Bar Graph", "Multi-line Chart", "Area Chart", "Scatter Plot"],
            3: ["Grouped Bar Graph", "Multi-line Chart", "Area Chart", "Scatter Plot"]
        },
        random_forest: {
            1: ["Line Chart", "Area Chart", "Bar Graph", "Scatter Plot"],
            2: ["Grouped Bar Graph", "Multi-line Chart", "Area Chart", "Scatter Plot"],
            3: ["Grouped Bar Graph", "Multi-line Chart", "Area Chart", "Scatter Plot"]
        },
        polynomial_reg: {
            1: ["Line Chart", "Area Chart", "Bar Graph", "Scatter Plot"],
            2: ["Multi-line Chart", "Scatter Plot", "Area Chart"],
            3: ["Multi-line Chart", "Area Chart"]
        },
        svm: {
            1: ["Scatter Plot", "Line Chart", "Bar Graph"],
            2: ["2D Scatter Plot", "Bar Graph", "Multi-line Chart"],
            // ADD THIS LINE for 3 or more parameters
            3: ["Multi-line Chart", "Grouped Bar Graph", "Scatter Plot"]
        }
    };

    const VIZ_JS_TYPE = {
        "Line Chart": "line",
        "Bar Graph": "bar",
        "Grouped Bar Graph": "bar",
        "Multi-line Chart": "line",
        "Area Chart": "line",
        "Scatter Plot": "scatter",
        "2D Scatter Plot": "scatter",
        "Pie Chart": "pie"
    };

    // -- State
    const state = {
        country: null,
        selectedParams: [],
        selectedAlgo: null,
        selectedViz: null,
        chart: null,
        years: []
    };

    // -- DOM elements
    const datalist = document.getElementById("country-list");
    const countryInput = document.getElementById("country-search");
    const paramsContainer = document.getElementById("params-container");
    const algoContainer = document.getElementById("algo-container");
    const vizContainer = document.getElementById("viz-container");
    const analyzeBtn = document.getElementById("analyze-btn");
    const resultCanvas = document.getElementById("result-chart");
    const exportCSVBtn = document.getElementById("exportCSV");
    const exportPDFBtn = document.getElementById("exportPDF");
    const exportPNGBtn = document.getElementById("exportPNG");
    // NEW: Reference to the metrics display container
    const metricsDisplay = document.getElementById("metrics-display");


    // Fetch country list
    async function fetchCountries() {
        const res = await fetch(`/countries`);
        const data = await res.json();
        return data.countries || [];
    }

    // Render parameter checkboxes
    function renderParams() {
        paramsContainer.innerHTML = "";
        PARAMETERS.forEach(param => {
            const id = `param-${param}`;
            const div = document.createElement("div");
            div.className = "param";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.id = id;
            checkbox.value = param;
            checkbox.addEventListener("change", () => {
                if (checkbox.checked) {
                    if (!state.selectedParams.includes(param)) state.selectedParams.push(param);
                } else {
                    state.selectedParams = state.selectedParams.filter(p => p !== param);
                }
                renderVisualizationOptions();
            });

            const label = document.createElement("label");
            label.htmlFor = id;
            label.innerText = PARAM_LABELS[param] || param.replace(/_/g, " ");

            div.appendChild(checkbox);
            div.appendChild(label);
            paramsContainer.appendChild(div);
        });
    }

    // Render algorithm cards
    function renderAlgorithms() {
        algoContainer.innerHTML = "";
        ALGORITHMS.forEach(algo => {
            const card = document.createElement("div");
            card.className = "algo-card";
            card.dataset.key = algo.key;
            card.innerText = algo.name;
            card.tabIndex = 0;
            card.addEventListener("click", () => {
                document.querySelectorAll(".algo-card").forEach(c => c.classList.remove("selected"));
                card.classList.add("selected");
                state.selectedAlgo = algo.key;
                renderVisualizationOptions();
            });
            algoContainer.appendChild(card);
        });
    }

    // Render visualization options
    function renderVisualizationOptions() {
        vizContainer.innerHTML = "";
        const algoKey = state.selectedAlgo;
        const nParams = state.selectedParams.length;
        if (!algoKey || nParams === 0) return;
        const possible = VIZ_OPTIONS_MAP[algoKey][nParams > 3 ? 3 : nParams] || [];

        if (nParams > 1 && (state.years && state.years.length === 1)) possible.push("Pie Chart");

        possible.forEach(viz => {
            const opt = document.createElement("div");
            opt.className = "viz-option";
            opt.innerText = viz;
            opt.tabIndex = 0;
            opt.addEventListener("click", () => {
                document.querySelectorAll(".viz-option").forEach(b => b.classList.remove("selected"));
                opt.classList.add("selected");
                state.selectedViz = viz;
            });
            vizContainer.appendChild(opt);
        });

        const first = vizContainer.querySelector(".viz-option");
        if (first) {
            first.classList.add("selected");
            state.selectedViz = first.innerText;
        }
    }

    // Gemini summary prompt generator
    function makeGeminiPrompt(country, parameters, years, predictions, chartType) {
        const yearsPreview = years.slice(0, 5).join(", ") + (years.length > 5 ? ", ..." : "");
        const paramSummaries = parameters.map(param => {
            const vals = predictions[param] || [];
            return `${param}: [${vals.slice(0, 8).map(v => +v.toFixed(2)).join(", ")}${vals.length > 8 ? ", ..." : ""}]`;
        }).join("\n");

        return `
      You are an economic analyst AI. Your task is to provide insights for a dashboard.
      Based strictly on the provided data, write two sections: "AI Insights" and "Suggestions".

      **Crucial Formatting Rules:**
      - For each section, provide 2-3 concise points.
      - **Start each point on a new line and number it (e.g., 1., 2., 3.).**
      - Do not use any other markdown (like **bolding**).

      ---
      Country: ${country}
      Parameters: ${parameters.join(", ")}
      Years: ${yearsPreview}
      Chart Type: ${chartType}
      Data:
      ${paramSummaries}
    `;
    }

    // Gemini API fetcher
    async function fetchGeminiSummary(prompt) {
        const API_KEY = "AIzaSyBf5v6eYgz2OWiAx_9m04jffByNuJZbMPk"; // Replace with your actual key
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;

        const body = {
            contents: [{ role: "user", parts: [{ text: prompt }] }]
        };

        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            const data = await res.json();

            if (data.error) {
                console.error("Gemini API Error:", data.error.message);
                return `API Error: ${data.error.message}`;
            }

            if (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
                return data.candidates[0].content.parts[0].text;
            } else {
                console.warn("Could not find generated text in API response.", data);
                return "No summary generated.";
            }
        } catch (error) {
            console.error("Failed to fetch from Gemini API:", error);
            return "Failed to generate summary due to a network or code error.";
        }
    }

    // Insert the summary under the chart
    async function addSummary(country, parameters, years, predictions, chartType) {
        let summaryArea = document.getElementById("chart-summary");

        if (!summaryArea) {
            summaryArea = document.createElement("div");
            summaryArea.id = "chart-summary";
            const resultsArea = document.getElementById("results-area");
            if (resultsArea) {
                resultsArea.appendChild(summaryArea);
            }
        }

        summaryArea.innerHTML = "AI summary is being generated...";

        try {
            const prompt = makeGeminiPrompt(country, parameters, years, predictions, chartType);
            const summary = await fetchGeminiSummary(prompt);
            summaryArea.innerHTML = `<br>${summary.replace(/\n/g, "<br>")}`;
        } catch (e) {
            summaryArea.innerHTML = "No summary available.";
        }
    }

    // NEW: Function to render the performance metrics
    function renderMetrics(metrics) {
        metricsDisplay.innerHTML = "";

        const title = document.createElement("h3");
        title.innerText = "Model Performance Metrics";
        metricsDisplay.appendChild(title);

        const wrapper = document.createElement("div");
        wrapper.className = "metrics-wrapper";

        for (const param in metrics) {
            const card = document.createElement("div");
            card.className = "metric-card";

            const paramMetrics = metrics[param];
            const paramLabel = PARAM_LABELS[param] || param.replace(/_/g, " ");

            card.innerHTML = `
                <h4>${paramLabel}</h4>
                <p><strong>R² Score:</strong> ${paramMetrics.r2.toFixed(4)}</p>
                <p><strong>AAE (MAE):</strong> ${paramMetrics.mae.toFixed(4)}</p>
                <p><strong>SE (RMSE):</strong> ${paramMetrics.rmse.toFixed(4)}</p>
            `;
            wrapper.appendChild(card);
        }

        metricsDisplay.appendChild(wrapper);
    }

    // Main chart renderer
    async function renderChart(years, predictions) {
        if (state.chart) state.chart.destroy();
        const chartType = VIZ_JS_TYPE[state.selectedViz] || "line";
        let datasets;

        if (chartType === "scatter") {
            datasets = Object.keys(predictions).map((param, idx) => ({
                label: param,
                data: years.map((y, i) => ({ x: y, y: predictions[param][i] })),
                backgroundColor: `hsl(${(idx * 62) % 360}, 70%, 55%)`,
                showLine: false
            }));
        } else { // Handles 'line' and 'bar'
            datasets = Object.keys(predictions).map((param, idx) => ({
                label: param,
                data: predictions[param],
                borderColor: `hsl(${(idx * 62) % 360}, 70%, 55%)`,
                backgroundColor: chartType === 'bar' ? `hsl(${(idx * 62) % 360}, 70%, 60%)` : `hsl(${(idx * 62) % 360}, 70%, 80%)`,
                fill: state.selectedViz === "Area Chart",
                borderWidth: 2
            }));
        }

        state.chart = new Chart(resultCanvas, {
            type: chartType,
            data: {
                labels: chartType === "scatter" ? undefined : years,
                datasets: datasets
            },
            options: {
                responsive: true,
                plugins: { legend: { display: true } },
                scales: {
                    x: { type: chartType === "scatter" ? "linear" : "category", title: { display: true, text: "Year" } },
                    y: { title: { display: true, text: "Value" } }
                }
            }
        });
    }

    // Run analysis handler
    async function runAnalysis() {
        const country = countryInput.value.trim();
        if (!country || !state.selectedAlgo || !state.selectedParams.length || !state.selectedViz) {
            alert("Please select country, parameters, algorithm, and visualization!");
            return;
        }
        analyzeBtn.disabled = true;
        analyzeBtn.innerText = "Analyzing...";

        // NEW: Clear old metrics before starting
        metricsDisplay.innerHTML = "";

        try {
            const algorithm = state.selectedAlgo;
            const response = await fetch(`/predict`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ country, parameters: state.selectedParams, algorithm })
            });
            const data = await response.json();
            if (!response.ok || data.error) throw new Error(data.error || "Prediction failed");

            state.years = data.years;
            await renderChart(data.years, data.predictions);

            // NEW: Call the renderMetrics function with the new data
            if (data.metrics) {
                renderMetrics(data.metrics);
            }

            // Call addSummary last so it appears below the metrics
            await addSummary(state.country, state.selectedParams, data.years, data.predictions, state.selectedViz);

        } catch (e) {
            alert("Analysis failed: " + e.message);
        }
        analyzeBtn.disabled = false;
        analyzeBtn.innerText = "Analyze";
    }

    // Export functions
    function exportPDF() {
        const country = countryInput.value.trim();
        if (!country || !state.selectedParams.length) {
            return alert("Select country and parameter(s)!");
        }
        const summaryArea = document.getElementById("chart-summary");
        const summaryText = summaryArea ? summaryArea.innerText : "";
        const qs = state.selectedParams.map(p => `parameters=${encodeURIComponent(p)}`).join("&");
        const summaryParam = summaryText ? `&summary=${encodeURIComponent(summaryText)}` : "";
        window.open(`/export/pdf?country=${encodeURIComponent(country)}&${qs}${summaryParam}`);
    }

    function exportPNG() {
        const country = countryInput.value.trim();
        if (!country || !state.selectedParams.length) {
            alert("Select country and a parameter!");
            return;
        }
        window.open(`/export/png?country=${encodeURIComponent(country)}&parameter=${encodeURIComponent(state.selectedParams[0])}`);
    }

    function exportCSV() {
        const country = countryInput.value.trim();
        if (!country || !state.selectedParams.length) {
            alert("Select country and parameter(s)!");
            return;
        }
        const qs = state.selectedParams.map(p => `parameters=${encodeURIComponent(p)}`).join("&");
        window.open(`/export/csv?country=${encodeURIComponent(country)}&${qs}`);
    }

    // Initialize app
    (async function init() {
        const countries = await fetchCountries();
        countries.forEach(c => {
            const option = document.createElement("option");
            option.value = c;
            datalist.appendChild(option);
        });
        renderParams();
        renderAlgorithms();
        countryInput.addEventListener("change", () => {
            state.country = countryInput.value.trim();
            renderVisualizationOptions();
        });
        analyzeBtn.addEventListener("click", runAnalysis);
        exportCSVBtn.addEventListener("click", exportCSV);
        exportPDFBtn.addEventListener("click", exportPDF);
        exportPNGBtn.addEventListener("click", exportPNG);
    })();
            // === THEME TOGGLE === 🌞🌙 with animation
    const themeToggleBtn = document.getElementById("theme-toggle");
    const refreshBtn = document.getElementById("refresh-btn");

    // Load and apply saved theme
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light") {
        document.documentElement.classList.add("light");
        themeToggleBtn.innerHTML = "🌙 Dark";
    } else {
        themeToggleBtn.innerHTML = "🌞 Light";
    }

    // Toggle theme with icon & rotation animation
    themeToggleBtn.addEventListener("click", () => {
        const html = document.documentElement;
        const isLight = html.classList.toggle("light");
        themeToggleBtn.classList.add("spinning");

        if (isLight) {
            themeToggleBtn.innerHTML = "🌙 Dark";
            localStorage.setItem("theme", "light");
        } else {
            themeToggleBtn.innerHTML = "🌞 Light";
            localStorage.setItem("theme", "dark");
        }

        // Remove spin class after animation ends
        setTimeout(() => themeToggleBtn.classList.remove("spinning"), 400);
    });

    // === REFRESH BUTTON ===
    refreshBtn.addEventListener("click", () => {
        if (confirm("Do you want to reset and refresh the dashboard?")) {
            localStorage.removeItem("theme");
            location.reload();
        }
    });
})();
