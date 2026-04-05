# Project TBD

## Project Plan
Computer vision model for patients in waiting rooms to flag visible symptoms/warning signs and adjust severity
Going with most commonly missed diagnoses in a waiting room 
Strokes:
Facial asymmetry (model camera)
Glucose levels (previous data from patients) 
BMI (patient gives)
Age (patient gives)
MAYBE Respiratory issues (turning blue, can’t breathe), features check:
Lips color
chest/shoulder rising rate
MAYBE Allergic reactions (hives, respiratory issues again) 
Convulsing
Can’t breathe
Demo will connect to camera or show images / video pipeline to prove it works
Rubic Pi connected to CCTV to check patients (nothing stored, anonymous, don’t need consent). Then send a warning for a specific area (eg: check on zone A) to the nurse, who goes there and checks on patients. Take pictures with the phone, upload to the computer as well. That way, if the hospital is super busy, the nurse can only check on the waiting room when given that alert. Avoids having nurses constantly checking and potentially missing people. The model for CCTV should be sensitive to false positives, but no false negatives.
Use Nexa SDK and Qualcomm hardware to run it locally
Can tie to OpenClaw (AI Assistant) for doctors to use to check message from model app
Using mediapipe pose estimation, facial feature mapping to detect bodily movement or facial drooping -> feed feature points/map to some model? Or run some of our own backend logic to calculate chances of certain illnesses.



## Tech Stack
frontend: Next.js
model: maybe transfer learning or fine tuning an existing model such as VGGface? using these datasets (more specified for strokes):
https://www.kaggle.com/datasets/fedesoriano/stroke-prediction-dataset
https://www.kaggle.com/datasets/abdussalamelhanashy/annotated-facial-images-for-stroke-classification?select=Annotated+stroke+and+non+stroke+Dataset

