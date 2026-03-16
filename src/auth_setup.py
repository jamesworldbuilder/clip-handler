import os
from google_auth_oauthlib.flow import InstalledAppFlow

# defines required api scope for video uploads
SCOPES = ['https://www.googleapis.com/auth/youtube.upload']

def generate_token():
    # sets paths for credentials and token output
    client_secrets_file = 'config/client-secrets.json'
    token_file = 'config/token.json'

    # initializes oauth flow from client secrets
    flow = InstalledAppFlow.from_client_secrets_file(client_secrets_file, SCOPES)
    
    # runs local server to capture authorization code
    credentials = flow.run_local_server(port=0)

    # writes resulting credentials to token file
    with open(token_file, 'w') as f:
        f.write(credentials.to_json())

if __name__ == '__main__':
    generate_token()
