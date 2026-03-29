
import os
import base64
from datetime import datetime
from dotenv import load_dotenv

from flask import Flask, render_template
from flask_socketio import SocketIO, emit
from gtts import gTTS
from groq import Groq

load_dotenv()
app = Flask(__name__)
app.config["SECRET_KEY"] = "secret-key"
socketio = SocketIO(app, cors_allowed_origins="*")

# -------------------------
#  PATHS
# -------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMP_DIR = os.path.join(BASE_DIR, "temp_audio")
os.makedirs(TEMP_DIR, exist_ok=True)

# -------------------------
#  GROQ CLIENT
# -------------------------
GROQ_API_KEY = os.getenv("GROQ_API_KEY")  

if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY not found! Check your .env file.")

groq_client = Groq(api_key=GROQ_API_KEY)
  
# -------------------------
#  AI ANSWER USING GROQ
# -------------------------
def generate_answer_groq(query: str) -> str:
    if not query.strip():
        return "Please type a question."

    try:
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are an intelligent helpful assistant."},
                {"role": "user", "content": query},
            ],
            max_tokens=300,
        )

        return response.choices[0].message.content

    except Exception as e:
        print("Groq error:", e)
        return "AI server error. Please try later."

# -------------------------
#  TEXT → SPEECH (gTTS)
# -------------------------
def generate_tts(text: str) -> bytes:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    mp3_path = os.path.join(TEMP_DIR, f"tts_{ts}.mp3")

    tts = gTTS(text=text, lang="en")
    tts.save(mp3_path)

    with open(mp3_path, "rb") as f:
        return f.read()

# -------------------------
#  ROUTES
# -------------------------
@app.route("/")
def index():
    return render_template("index.html")

# -------------------------
#  SOCKET EVENTS
# -------------------------
@socketio.on("start_listening")
def handle_start_listening():
    emit(
        "response",
        {
            "text": "Voice input not implemented yet. Type your question.",
            "audio": None,
            "visemes": [],
        },
    )

@socketio.on("text_query")
def handle_text_query(data):
    query = (data or {}).get("query", "")
    print("Query:", query)

    # 1) AI Answer
    answer = generate_answer_groq(query)

    # 2) TTS Convert
    audio_b64 = None
    try:
        mp3_bytes = generate_tts(answer)
        audio_b64 = base64.b64encode(mp3_bytes).decode("utf-8")
    except Exception as e:
        print("TTS error:", e)

    # 3) Send Response Back
    emit(
        "response",
        {
            "text": answer,
            "audio": audio_b64,
            "visemes": [],
        },
    )

if __name__ == "__main__":
    print("Device set to use cpu")
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)


# Here are 10 questions with brief answers:

# 1. **What is the largest planet in our solar system?** 
# Answer: Jupiter.

# 2. **Which element has the symbol 'H' in the periodic table?** 
# Answer: Hydrogen.

# 3. **What is the largest mammal on Earth?** 
# Answer: Blue whale.

# 4. **Who painted the famous painting 'The Starry Night'?** 
# Answer: Vincent van Gogh.

# 5. **What is the chemical symbol for gold?** 
# Answer: Au.

# 6. **Which river is the longest in the world?** 
# Answer: Nile River.

# 7. **What is the largest living species of lizard?** 
# Answer: Komodo dragon.

# 8. **Who wrote the famous book 'To Kill a Mockingbird'?** 
# Answer: Harper Lee.

# 9. **What is the process called when plants make their own food?** 
# Answer: Photosynthesis.

# 10. **What is the largest state in the United States by land area?** 
# Answer: Alaska.
