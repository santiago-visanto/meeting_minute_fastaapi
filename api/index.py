import io
import PyPDF2
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import json
from datetime import datetime
from langgraph.graph import Graph
from langchain_community.adapters.openai import convert_openai_messages
from langchain_cohere import ChatCohere
from dotenv import load_dotenv
import os
from io import BytesIO

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL = 'command-r-plus'

class MinutesData(BaseModel):
    title: str
    date: str
    attendees: list
    summary: str
    takeaways: list
    conclusions: list
    next_meeting: list
    tasks: list
    message: Optional[str] = None

def extract_text(content: bytes, filename: str) -> str:
    if filename.endswith('.pdf'):
        pdf_reader = PyPDF2.PdfReader(io.BytesIO(content))
        text = ""
        for page in pdf_reader.pages:
            text += page.extract_text()
    elif filename.endswith('.txt'):
        text = content.decode('utf-8')
    else:
        raise HTTPException(status_code=400, detail="Unsupported file format")
    return text

class WriterAgent:

    def writer(self, the_text: str, word_count=500):
        sample_json = """
        {
            "title": "Title of the meeting",
            "date": "Date of the meeting",
            "attendees": "List of dictionaries of the meeting attendees. The dictionaries must have the following key values: name, position, and role. The role key refers to the attendee's function in the meeting. If any of the values of these keys is not clear or is not mentioned, it is given the value none.",
            "summary": "Succinctly summarize the minutes of the meeting in 3 clear and coherent paragraphs. Separate paragraphs using newline characters.",
            "takeaways": "List of the takeaways of the meeting minute.",
            "conclusions": "List of conclusions and actions to be taken.",
            "next_meeting": "List of the commitments made at the meeting. Be sure to go through the entire content of the meeting before giving your answer.",
            "tasks": "List of dictionaries for the commitments acquired in the meeting. The dictionaries must have the following key values responsible, date, and description. In the key-value description, it is advisable to mention specifically what the person in charge is expected to do instead of indicating general actions. Be sure to include all the items in the next_meeting list.",
            "message": "Message to the critique."
        }
        """

        prompt = [{
            "role": "system",
            "content": "As an expert in minute meeting creation, you are a chatbot designed to facilitate the process of generating meeting minutes efficiently.\n"
                       "Please return nothing but a JSON in the following format:\n"
                       f"{sample_json}\n"
                       "Respond in Spanish.\n"
                       "Ensure that your responses are structured, concise, and provide a comprehensive overview of the meeting proceedings for effective record-keeping and follow-up actions."
        }, {
            "role": "user",
            "content": f"Today's date is {datetime.now().strftime('%d/%m/%Y')}.\n"
                       f"{the_text}\n"
                       f"Your task is to write up for me the minutes of the meeting described above, including all the points of the meeting. "
                       f"The meeting minutes should be approximately {word_count} words and should be divided into paragraphs using newline characters."
        }]
        
        lc_messages = convert_openai_messages(prompt)
        optional_params = {
            "response_format": {"type": "json_object"}
        }

        response = ChatCohere(model=MODEL, max_retries=1, temperature=.5, model_kwargs=optional_params).invoke(lc_messages).content
        cleaned_response = response.strip("`").strip("\n").strip("json").strip("")
        return json.loads(cleaned_response)

    def revise(self, article: dict):
        sample_revise_json = """
        {
            "title": "Title of the meeting",
            "date": "Date of the meeting",
            "attendees": "List of dictionaries of the meeting attendees. The dictionaries must have the following key values: name, position, and role. The role key refers to the attendee's function in the meeting. If any of the values of these keys is not clear or is not mentioned, it is given the value none.",
            "summary": "Succinctly summarize the minutes of the meeting in 3 clear and coherent paragraphs. Separate paragraphs using newline characters.",
            "takeaways": "List of the takeaways of the meeting minute.",
            "conclusions": "List of conclusions and actions to be taken.",
            "next_meeting": "List of the commitments made at the meeting. Be sure to go through the entire content of the meeting before giving your answer.",
            "tasks": "List of dictionaries for the commitments acquired in the meeting. The dictionaries must have the following key values responsible, date, and description. In the key-value description, it is advisable to mention specifically what the person in charge is expected to do instead of indicating general actions. Be sure to include all the items in the next_meeting list.",
            "message": "Message to the critique."
        }
        """

        prompt = [{
            "role": "system",
            "content": "You are an expert meeting minutes creator in Spanish. Your sole purpose is to edit well-written minutes on a topic based on given critique.\n"
                       "Respond in Spanish language."
        }, {
            "role": "user",
            "content": f"{json.dumps(article)}\n"
                       f"Your task is to edit the meeting minutes based on the critique given.\n"
                       f"Please return json format of the 'dictionaries' and a new 'message' field to the critique that explain your changes or why you didn't change anything.\n"
                       f"Please return nothing but a JSON in the following format:\n"
                       f"{sample_revise_json}\n"
        }]

        lc_messages = convert_openai_messages(prompt)
        optional_params = {
            "response_format": {"type": "json_object"}
        }

        response = ChatCohere(model=MODEL, max_retries=1, temperature=.5, model_kwargs=optional_params).invoke(lc_messages).content
        cleaned_response = response.strip("`").strip("\n").strip("json").strip("")
        response = json.loads(cleaned_response)
        return response

    def run(self, article: dict):
        print("Writer working...", article.keys())
        critique = article.get("critique")
        if critique is not None:
            article.update(self.revise(article))
        else:
            article.update(self.writer(article["source"], word_count=article['words']))
        return article


class CritiqueAgent:

    def critique(self, article: dict):
        short_article = article.copy()
        del short_article['source']  # to save tokens

        prompt = [{
            "role": "system",
            "content": "You are critical of meeting minutes. Its sole purpose is to provide brief feedback on meeting minutes so the writer knows what to fix.\n"
                       "Respond in Spanish."
        }, {
            "role": "user",
            "content": f"Today's date is {datetime.now().strftime('%d/%m/%Y')}.\n"
                       f"{json.dumps(short_article)}\n"
                       f"Your task is to provide feedback on the meeting minutes only if necessary.\n"
                       f"Be sure that names are given for split votes and for debate.\n"
                       f"The maker of each motion should be named.\n"
                       f"If you think the meeting minutes are good, please return only the word 'None' without the surrounding hash marks.\n"
                       f"Do NOT return any text except the word 'None' without surrounding hash marks if no further work is needed on the article.\n"
                       f"If you notice the field 'message' in the meeting minutes, it means the writer has revised the meeting minutes based on your previous critique. The writer may have explained in the message why some of your critique could not be accommodated. For example, something you asked for is not available information.\n"
                       f"You can provide feedback on the revised meeting minutes or return only the word 'None' without surrounding hash marks if you think the article is good."
        }]

        lc_messages = convert_openai_messages(prompt)
        response = ChatCohere(model=MODEL, max_retries=1, temperature=1.0).invoke(lc_messages).content

        if response == 'None':
            return {'critique': None}
        else:
            return {'critique': response, 'message': None}


class InputAgent:
    def __init__(self):
        self.inputs = []

    def get_input(self, content: bytes, filename: str):
        print("Processing input", filename)
        try:
            the_text = extract_text(content, filename)
        except Exception as e:
            return {"error": f"Error generating acta: {str(e)}"}
        return the_text

    def receive(self, content: bytes, filename: str):
        print("Receiving input", filename)
        text = self.get_input(content, filename)
        self.inputs.append(text)
        return text


class StateMachine:

    def __init__(self):
        self.input_agent = InputAgent()
        self.writer_agent = WriterAgent()
        self.critique_agent = CritiqueAgent()

    def process(self, file: UploadFile, words: int = 500):
        try:
            print("Running state machine")
            content = file.file.read()
            filename = file.filename
            the_text = self.input_agent.receive(content, filename)

            article = {
                "source": the_text,
                "words": words
            }

            # Initial critique of the article
            article.update(self.critique_agent.critique(article))

            # Final version of the article
            return self.writer_agent.run(article)

        except Exception as e:
            return {"error": f"Error generating acta: {str(e)}"}


state_machine = StateMachine()


@app.post("/generate_minutes")
async def generate_minutes(file: UploadFile = File(...)):
    return state_machine.process(file)


@app.post("/process_critique")
async def process_critique(file: UploadFile = File(...), critique: str = Form(...), article: str = Form(...)):
    article_json = json.loads(article)
    article_json["critique"] = critique

    # File processing
    content = await file.read()
    filename = file.filename
    the_text = extract_text(content, filename)

    article_json["source"] = the_text

    return state_machine.writer_agent.revise(article_json)
