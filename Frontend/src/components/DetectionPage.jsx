import React, { useState, useRef, useEffect } from "react";

const DetectionPage = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [error, setError] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  const uploadInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  // Start webcam stream
  const startCamera = async () => {
    setCameraError(null);
    setShowCamera(true);
    setShowDropdown(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      setCameraError("Could not access camera. Please allow camera permission.");
      console.error("Camera error:", err);
    }
  };

  // Assign stream to video element once modal is shown
  useEffect(() => {
    if (showCamera && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [showCamera]);

  // Stop webcam stream
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
    setCameraError(null);
  };

  // Capture a frame from the video and create a File
  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      const file = new File([blob], "camera_photo.jpg", { type: "image/jpeg" });
      setSelectedFile(file);
      setPrediction(null);
      setError(null);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result);
      reader.readAsDataURL(file);
      stopCamera();
    }, "image/jpeg", 0.92);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setSelectedFile(file);
    setPrediction(null);
    setError(null);

    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const [clinicLoading, setClinicLoading] = useState(false);
  const [clinicError, setClinicError] = useState(null);

  const handleFindClinics = () => {
    setClinicError(null);

    if (!navigator.geolocation) {
      // Fallback: open Maps with text search only
      const query = encodeURIComponent("Dermatology clinic near me");
      window.open(`https://www.google.com/maps/search/${query}`, "_blank");
      return;
    }

    setClinicLoading(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setClinicLoading(false);
        const { latitude, longitude } = position.coords;
        const query = encodeURIComponent("Dermatology clinic");
        // Opens Maps centered on the user's exact GPS location
        const url = `https://www.google.com/maps/search/${query}/@${latitude},${longitude},14z`;
        window.open(url, "_blank");
      },
      (err) => {
        setClinicLoading(false);
        console.warn("Geolocation error:", err);
        // Still open Maps, just without coordinates
        const query = encodeURIComponent("Dermatology clinic near me");
        window.open(`https://www.google.com/maps/search/${query}`, "_blank");
        setClinicError("Could not get your location — showing general results instead.");
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };

  const handleDetect = async () => {
    if (!selectedFile) return;

    setLoading(true);
    setError(null);
    setPrediction(null);

    try {
      const formData = new FormData();
      formData.append("image", selectedFile);

      const response = await fetch("http://localhost:7860/predict", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Prediction failed");
      }

      const result = await response.json();
      setPrediction(result);
    } catch (err) {
      setError(err.message);
      console.error("Error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0d1b2a] text-white px-4">

      {/* Camera Modal */}
      {showCamera && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-lg flex flex-col items-center gap-4">
            <h2 className="text-xl font-bold text-white">📸 Take a Photo</h2>

            {cameraError ? (
              <p className="text-red-400 text-sm text-center">{cameraError}</p>
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full rounded-xl border-2 border-gray-600"
                style={{ maxHeight: "360px", objectFit: "cover" }}
              />
            )}

            {/* Hidden canvas for capture */}
            <canvas ref={canvasRef} className="hidden" />

            <div className="flex gap-4 w-full">
              <button
                onClick={capturePhoto}
                disabled={!!cameraError}
                className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed transition px-6 py-3 rounded-xl text-white font-semibold flex items-center justify-center gap-2"
              >
                📷 Capture
              </button>
              <button
                onClick={stopCamera}
                className="flex-1 bg-gray-700 hover:bg-gray-600 transition px-6 py-3 rounded-xl text-white font-semibold flex items-center justify-center gap-2"
              >
                ✕ Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden upload input */}
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Logo */}
      <img src="/logo.png" alt="MedAI Logo" className="w-40 mb-4" />

      {/* MEDAI Title */}
      <h1 className="text-4xl font-extrabold mb-6">MEDAI</h1>

      {/* Choose Photo Button with hover dropdown */}
      <div
        className="relative mb-6"
        onMouseEnter={() => setShowDropdown(true)}
        onMouseLeave={() => setShowDropdown(false)}
      >
        <button className="bg-green-600 hover:bg-green-700 transition px-6 py-2 rounded-md text-white font-medium flex items-center gap-2">
          📷 Choose Photo
          <span className="text-xs opacity-75">▾</span>
        </button>

        {/* Dropdown menu */}
        {showDropdown && (
          <div className="absolute top-full left-0 mt-1 w-48 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50 overflow-hidden">
            <button
              onClick={startCamera}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-gray-700 transition text-left"
            >
              <span className="text-lg">📸</span>
              <div>
                <p className="font-medium">Camera</p>
                <p className="text-xs text-gray-400">Take a photo now</p>
              </div>
            </button>
            <div className="border-t border-gray-600" />
            <button
              onClick={() => { uploadInputRef.current.click(); setShowDropdown(false); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-gray-700 transition text-left"
            >
              <span className="text-lg">🖼️</span>
              <div>
                <p className="font-medium">Upload Photo</p>
                <p className="text-xs text-gray-400">Choose from files</p>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* Selected File Info */}
      {selectedFile && (
        <div className="mb-6 w-full max-w-md">
          <p className="text-center mb-4 text-gray-300">
            Selected File: {selectedFile.name}
          </p>
        </div>
      )}

      {/* Image Preview */}
      {imagePreview && (
        <div className="bg-gray-800 p-4 rounded-md mb-6 w-full max-w-md">
          <img
            src={imagePreview}
            alt="Preview"
            className="w-full h-auto rounded-md"
          />
        </div>
      )}

      {/* Detect Button */}
      {selectedFile && (
        <button
          onClick={handleDetect}
          disabled={loading}
          className={`${
            loading
              ? "bg-gray-500 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700"
          } transition px-8 py-3 rounded-md mb-6 text-white font-medium text-lg`}
        >
          {loading ? "Detecting..." : "Detect"}
        </button>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-600 p-4 rounded-md mb-6 w-full max-w-md text-center">
          <p className="text-white">Error: {error}</p>
        </div>
      )}

      {/* Result Div */}
      <div className="bg-gray-700 p-6 rounded-md w-full max-w-md text-center">
        {prediction ? (
          <div className="space-y-4">
            <div>
              <p className="text-gray-300 text-sm">Predicted Disease :</p>
              <p className="text-green-400 font-bold text-lg">
                {prediction.prediction_full}
              </p>
            </div>

            <div>
              <p className="text-base font-semibold">
                Accuracy : {prediction.accuracy} %
              </p>
            </div>

            <button
              onClick={handleFindClinics}
              disabled={clinicLoading}
              className="mt-4 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:bg-emerald-900 disabled:cursor-wait transition-all duration-150 px-6 py-3 rounded-lg text-white font-semibold text-sm shadow-lg w-full"
            >
              {clinicLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Getting your location…
                </>
              ) : (
                <>
                  <span>📍</span>
                  Look Nearby Clinics
                </>
              )}
            </button>
            {clinicError && (
              <p className="text-xs text-yellow-400 mt-2 text-center">{clinicError}</p>
            )}
          </div>
        ) : (
          <p className="text-sm">
            {selectedFile && !loading
              ? "Click Detect to analyze the image"
              : "No photo selected yet"}
          </p>
        )}
      </div>
    </div>
  );
};

export default DetectionPage;
