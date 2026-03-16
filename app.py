import os
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from pathlib import Path
import numpy as np
import json
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras.preprocessing import image
from huggingface_hub import hf_hub_download
from werkzeug.utils import secure_filename

from tensorflow.keras.applications.resnet50 import preprocess_input as resnet_preprocess
from tensorflow.keras.applications.efficientnet import preprocess_input as effnet_preprocess
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input as mobilenet_preprocess


# ======================================================
# APP INIT
# ======================================================

FRONTEND_DIST = str(Path(__file__).resolve().parent / "Frontend" / "dist")
app = Flask(__name__, static_folder=FRONTEND_DIST, static_url_path="")
CORS(app)


# ======================================================
# CONFIG
# ======================================================

BASE_DIR = Path(__file__).resolve().parent

MODEL_DIR = BASE_DIR / "ham10000" / "results" / "models"

UPLOAD_FOLDER = BASE_DIR / "uploads"
UPLOAD_FOLDER.mkdir(exist_ok=True)

IMG_SIZE = (224, 224)
CONFIDENCE_THRESHOLD = 0.50


# ======================================================
# DOWNLOAD MODELS FROM HUGGINGFACE HUB (if not present)
# ======================================================

HF_REPO_ID = os.environ.get("HF_REPO_ID", "")  # e.g. "your-username/medai-models"

MODEL_FILES = [
    "resnet50_ham10000_best.keras",
    "efficientnet_b0_ham10000_best.keras",
    "efficientnet_b3_ham10000_best.keras",
    "mobilenet_v2_ham10000_best.keras",
    "class_names.json",
]

if HF_REPO_ID:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    print(f"📥 Downloading models from HuggingFace Hub: {HF_REPO_ID}")
    for fname in MODEL_FILES:
        dest = MODEL_DIR / fname
        if not dest.exists():
            print(f"   Downloading {fname}...")
            hf_hub_download(
                repo_id=HF_REPO_ID,
                filename=fname,
                local_dir=str(MODEL_DIR),
            )
        else:
            print(f"   ✓ {fname} already present")
    print("✅ All model files ready")

MODEL_PATHS = {
    "resnet": MODEL_DIR / "resnet50_ham10000_best.keras",
    "effb0": MODEL_DIR / "efficientnet_b0_ham10000_best.keras",
    "effb3": MODEL_DIR / "efficientnet_b3_ham10000_best.keras",
    "mobilenet": MODEL_DIR / "mobilenet_v2_ham10000_best.keras",
}

CLASS_NAMES_PATH = MODEL_DIR / "class_names.json"


DISEASE_NAMES = {
    "akiec": "Actinic Keratosis",
    "bcc": "Basal Cell Carcinoma",
    "bkl": "Benign Keratosis",
    "df": "Dermatofibroma",
    "mel": "Melanoma",
    "nv": "Nevus",
    "vasc": "Vascular Lesion"
}


# ======================================================
# LOAD MODELS
# ======================================================

print("🔄 Loading models...")

def safe_load_model(path):
    try:
        return keras.models.load_model(path, compile=False)
    except Exception as e:
        print(f"❌ Failed to load model: {path}")
        print(e)
        raise e


resnet = safe_load_model(MODEL_PATHS["resnet"])
effb0 = safe_load_model(MODEL_PATHS["effb0"])
effb3 = safe_load_model(MODEL_PATHS["effb3"])
mobilenet = safe_load_model(MODEL_PATHS["mobilenet"])

print("✅ All models loaded successfully")


# Load class names
with open(CLASS_NAMES_PATH, "r") as f:
    class_names = json.load(f)


# ======================================================
# IMAGE PREPROCESSING
# ======================================================

def load_image(img_path):

    img = image.load_img(img_path, target_size=IMG_SIZE)
    img_array = image.img_to_array(img)

    if img_array.shape[-1] != 3:
        img_array = img_array[..., :3]

    img_array = np.expand_dims(img_array, axis=0)

    return img_array


# ======================================================
# ENSEMBLE PREDICTION
# ======================================================

def predict_skin_disease(img_path):

    img_path = Path(img_path)

    if not img_path.exists():
        return {"error": "Image not found"}

    x = load_image(img_path)

    try:

        p_resnet = resnet.predict(resnet_preprocess(x), verbose=0)
        p_effb0 = effb0.predict(effnet_preprocess(x), verbose=0)
        p_effb3 = effb3.predict(effnet_preprocess(x), verbose=0)
        p_mobilenet = mobilenet.predict(mobilenet_preprocess(x), verbose=0)

        ensemble_probs = (p_resnet + p_effb0 + p_effb3 + p_mobilenet) / 4.0
        ensemble_probs = ensemble_probs[0]

        pred_idx = np.argmax(ensemble_probs)
        pred_class = str(class_names[pred_idx])
        confidence = float(ensemble_probs[pred_idx])

        probs_dict = {
            class_names[i]: float(ensemble_probs[i])
            for i in range(len(class_names))
        }

        full_disease_name = DISEASE_NAMES.get(pred_class, pred_class)

        MODEL_ACCURACY = 81.89

        return {
            "prediction": pred_class,
            "prediction_full": full_disease_name,
            "confidence": confidence,
            "accuracy": MODEL_ACCURACY,
            "probabilities": probs_dict,
            "low_confidence": bool(confidence < CONFIDENCE_THRESHOLD)
        }

    except Exception as e:
        return {"error": str(e)}


# ======================================================
# API ROUTES
# ======================================================

@app.route("/predict", methods=["POST"])
def predict():

    if "image" not in request.files:
        return jsonify({"error": "No image provided"}), 400

    file = request.files["image"]

    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    filename = secure_filename(file.filename)
    filepath = UPLOAD_FOLDER / filename

    file.save(str(filepath))

    try:

        result = predict_skin_disease(str(filepath))
        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        if filepath.exists():
            filepath.unlink()


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


# ======================================================
# SERVE FRONTEND
# ======================================================

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_spa(path):

    static_folder = app.static_folder

    if static_folder and path and os.path.exists(os.path.join(static_folder, path)):
        return send_from_directory(static_folder, path)

    if static_folder:
        return send_from_directory(static_folder, "index.html")

    return "Frontend not found"


# ======================================================
# RUN APP
# ======================================================

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 7860))

    print(f"🚀 Server starting on port {port}")

    app.run(
        host="0.0.0.0",
        port=port,
        debug=False
    )