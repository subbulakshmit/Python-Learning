PYTHON LAB - NETLIFY DEPLOYMENT (with backend)

Files
  index.html                    the app
  netlify/functions/api.mjs     backend: accounts, progress, feedback, admin analytics
  netlify.toml, package.json    Netlify settings and the @netlify/blobs dependency

Deploy with GitHub (recommended)
  1. Create a GitHub repository and upload ALL these files, keeping the folder structure.
  2. In Netlify: Add new site > Import an existing project > choose the repository.
  3. Build command: leave empty.  Publish directory: .   (netlify.toml already sets this)
  4. Site configuration > Environment variables > add ADMIN_PASSWORD = your admin password.
     (If you skip this the password defaults to: testsuccess)
  5. Deploy. Log in with user name admin to see the leaderboard and admin analytics.

Deploy with the Netlify CLI
  npm install
  npm i -g netlify-cli
  netlify login
  netlify deploy --prod

Note: drag-and-drop deploys do not install the backend's dependency, so use GitHub or the CLI.
Data (users, progress, feedback) is stored in Netlify Blobs. Passwords are stored hashed (scrypt).
