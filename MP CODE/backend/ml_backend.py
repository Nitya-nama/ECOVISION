# --- ReportLab MD5 fix for Python 3.8+ (Windows safe) ---
import sys
import hashlib
import builtins

# Define the fixed MD5 function
def _fixed_md5(data=b"", **kwargs):
    if "usedforsecurity" in kwargs:
        kwargs.pop("usedforsecurity")
    return hashlib._hashlib.openssl_md5(data)

# Patch in both hashlib and builtins before ReportLab loads
hashlib.md5 = _fixed_md5
builtins.md5 = _fixed_md5
sys.modules["hashlib"].md5 = _fixed_md5
# ----------------------------------------------------------

from flask import Flask, request, jsonify, send_file, send_from_directory
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import PolynomialFeatures
from sklearn.svm import SVR
from sklearn.tree import DecisionTreeRegressor
from sklearn.ensemble import RandomForestRegressor
from io import BytesIO
import os
from matplotlib.backends.backend_pdf import PdfPages

# Imports for metrics and numpy
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error
import numpy as np


# For PDF export

from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
app = Flask(__name__)

# Load dataset
df = pd.read_csv("MP CODE/backend/gdpdataset_cleaned.csv")

# --- parameter mapping (keys are frontend, values are CSV columns) ---
PARAM_MAP = {c: c for c in [
    "life_expectancy", "hdi_index", "co2_consump", "gdp",
    "services", "trade_percent_gdp", "pv_est", "inflation",
    "service_workers_percent", "hdi_full", "lex",
    "gdp_per_capita", "co2_pcap_cons"
]}


@app.route("/")
def serve_index():
    return send_from_directory("../frontend", "index.html")


@app.route("/<path:filename>")
def serve_static(filename):
    return send_from_directory("../frontend", filename)


@app.route("/countries")
def get_countries():
    countries = df["country"].dropna().unique().tolist()
    countries.sort()
    return jsonify({"countries": countries})


@app.route("/predict", methods=["POST"])
def predict():
    data = request.get_json()
    country = data["country"]
    parameters = data["parameters"]
    algorithm = data["algorithm"]

    country_df = df[df["country"].str.strip().str.lower() == country.strip().lower()]
    if country_df.empty:
        return jsonify({"error": f"No data found for {country}"}), 400

    valid_params = [PARAM_MAP.get(p, p) for p in parameters if PARAM_MAP.get(p, p) in df.columns]
    if not valid_params:
        return jsonify({"error": "No valid parameters selected"}), 400

    if "year" not in country_df.columns:
        return jsonify({"error": "Year column missing"}), 400

    country_df = country_df.dropna(subset=valid_params + ["year"])
    if country_df.empty:
        return jsonify({"error": "No data after cleaning"}), 400

    X = country_df["year"].values.reshape(-1, 1)
    predictions = {}
    
    # Initialize a dictionary to hold metrics
    metrics = {}

    for param in valid_params:
        y = country_df[param].values
        
        # Model Selection
        if algorithm == "decision_tree":
            model = DecisionTreeRegressor()
        elif algorithm == "random_forest":
            model = RandomForestRegressor(n_estimators=100)
        elif algorithm == "svm":
            model = SVR()
        elif algorithm in ("polynomial_reg", "poly_regression"):
            poly = PolynomialFeatures(degree=3)
            X_poly = poly.fit_transform(X)
            model = LinearRegression()
            model.fit(X_poly, y)
            y_pred = model.predict(X_poly)
            predictions[param] = y_pred.tolist()
            
            # Calculate and store metrics for this parameter
            metrics[param] = {
                "r2": r2_score(y, y_pred),
                "mae": mean_absolute_error(y, y_pred), # This is your AAE
                "rmse": np.sqrt(mean_squared_error(y, y_pred)) # This is your SE
            }
            continue # Continue to next parameter
        else:
            return jsonify({"error": f"Unsupported algorithm: {algorithm}"}), 400

        model.fit(X, y)
        y_pred = model.predict(X)
        predictions[param] = y_pred.tolist()
        
        # Calculate and store metrics for this parameter
        metrics[param] = {
            "r2": r2_score(y, y_pred),
            "mae": mean_absolute_error(y, y_pred),
            "rmse": np.sqrt(mean_squared_error(y, y_pred))
        }

    # Return metrics along with predictions
    return jsonify({
        "years": country_df["year"].tolist(),
        "predictions": predictions,
        "metrics": metrics 
    })


# --- Utility: image export ---
def export_image(country, parameter, img_format, mimetype, ext):
    mapped_param = PARAM_MAP.get(parameter, parameter)

    # Normalize country
    country_df = df[df["country"].str.strip().str.lower() == country.strip().lower()]

    if country_df.empty:
        return jsonify({"error": f"Invalid country: {country}"}), 400
    if mapped_param not in df.columns:
        return jsonify({"error": f"Invalid parameter: {parameter}"}), 400

    filtered = country_df[["year", mapped_param]].dropna()
    if filtered.empty:
        return jsonify({"error": "No data found"}), 400

    buffer = BytesIO()
    plt.figure(figsize=(10, 4))
    plt.plot(filtered["year"], filtered[mapped_param], marker="o", color="green")
    plt.title(f"{mapped_param} - {country}")
    plt.xlabel("Year")
    plt.ylabel(mapped_param)
    plt.grid(True)
    plt.savefig(buffer, format=img_format)
    plt.close()
    buffer.seek(0)
    return send_file(buffer, mimetype=mimetype, as_attachment=True,
                     download_name=f"{country}_{mapped_param}.{ext}")


@app.route("/export/png")
def export_png():
    country = request.args.get("country")
    parameter = request.args.get("parameter")
    return export_image(country, parameter, img_format="png",
                        mimetype="image/png", ext="png")


@app.route("/export/jpg")
def export_jpg():
    country = request.args.get("country")
    parameter = request.args.get("parameter")
    return export_image(country, parameter, img_format="jpg",
                        mimetype="image/jpeg", ext="jpg")


@app.route("/export/pdf")
def export_pdf():
    country = request.args.get("country")
    params = request.args.getlist("parameters")
    # 1. Get the summary text from the request
    summary_text = request.args.get("summary", "")

    if not country or not params:
        return jsonify({"error": "Country and parameters are required"}), 400

    buffer = BytesIO()
    # 2. Create a PDF document object
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    styles = getSampleStyleSheet()
    story = []

    # 3. Add a title to the PDF
    story.append(Paragraph(f"Economic Analysis for {country}", styles['h1']))
    story.append(Spacer(1, 0.2 * inch))

    # 4. Add the AI Insights section if summary text exists
    if summary_text:
        story.append(Paragraph("AI Generated Insights", styles['h2']))
        # Replace newlines with <br/> tags for proper formatting in the PDF
        formatted_summary = summary_text.replace('\n', '<br/>')
        story.append(Paragraph(formatted_summary, styles['BodyText']))
        story.append(Spacer(1, 0.3 * inch))

    # 5. Add a title for the charts section
    story.append(Paragraph("Data Visualizations", styles['h2']))
    story.append(Spacer(1, 0.2 * inch))
    
    # 6. Loop through parameters to generate and add charts
    for param in params:
        mapped_param = PARAM_MAP.get(param, param)
        country_df = df[df["country"].str.strip().str.lower() == country.strip().lower()]
        if country_df.empty or mapped_param not in df.columns:
            continue
        filtered = country_df[["year", mapped_param]].dropna()
        if filtered.empty:
            continue

        # Create plot in memory
        plt.figure(figsize=(8, 4))
        plt.plot(filtered["year"], filtered[mapped_param], marker="o", color="blue")
        plt.title(f"{mapped_param} - {country}")
        plt.xlabel("Year")
        plt.ylabel(mapped_param)
        plt.grid(True)
        plt.tight_layout()

        # Save plot to a temporary in-memory buffer
        img_buffer = BytesIO()
        plt.savefig(img_buffer, format='PNG')
        img_buffer.seek(0)
        plt.close() # Close the plot to free memory

        # Add the image to the PDF story
        story.append(Image(img_buffer, width=7*inch, height=3.5*inch))
        story.append(Spacer(1, 0.2 * inch))
    
    # 7. Build the PDF
    doc.build(story)

    buffer.seek(0)
    return send_file(buffer, mimetype="application/pdf", as_attachment=True,
                     download_name=f"{country}_report.pdf")

# --- Export CSV (raw data) ---
@app.route("/export/csv")
def export_csv():
    country = request.args.get("country")
    params = request.args.getlist("parameters")

    if not country or not params:
        return jsonify({"error": "Country and parameters are required"}), 400

    mapped_params = [PARAM_MAP.get(p, p) for p in params if PARAM_MAP.get(p, p) in df.columns]
    if not mapped_params:
        return jsonify({"error": "No valid parameters found in dataset"}), 400

    cols = ["year"] + mapped_params

    # Normalize country
    country_df = df[df["country"].str.strip().str.lower() == country.strip().lower()]
    if country_df.empty:
        return jsonify({"error": f"No data found for {country}"}), 400

    filtered = country_df[cols].dropna()
    if filtered.empty:
        return jsonify({"error": "No valid data for export"}), 400

    buffer = BytesIO()
    filtered.to_csv(buffer, index=False)
    buffer.seek(0)
    return send_file(buffer, mimetype="text/csv", as_attachment=True,
                     download_name=f"{country}_data.csv")


if __name__ == "__main__":
    app.run(debug=True)