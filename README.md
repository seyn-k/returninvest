# Getting Started with Create React App

Invoicing ROI Simulator
=======================

This repository contains a single-page React app and a lightweight Express backend that together provide an ROI calculator for switching from manual to automated invoicing. It supports live simulations, scenario CRUD (save/load/delete), and an email-gated downloadable report.

Quick Start
-----------

1. Install dependencies:

```
npm install
```

2. Set up environment variables (MongoDB): create a `.env` file in `returninvest/` with:

```
MONGODB_URI=mongodb://127.0.0.1:27017/roi_simulator
```

3. Start the backend API (port 4000):

```
npm run server
```

4. In a second terminal, start the React app (port 3000):

```
npm start
```

Alternatively, if you install `concurrently`, you can run both with:

```
npm run dev
```

Endpoints
---------

- POST `/simulate` — run simulation with inputs
- POST `/scenarios` — save a scenario
- GET `/scenarios` — list scenarios
- GET `/scenarios/:id` — fetch scenario
- DELETE `/scenarios/:id` — delete scenario
- POST `/report/generate` — generate report (requires `email`)

Data Storage
------------

- MongoDB database (default URI: `mongodb://127.0.0.1:27017/roi_simulator`). Configure via `.env`.

Notes
-----

- The UI auto-simulates on input changes.
- Report is generated as an HTML file and downloaded to your machine; enter your email to enable the download.

Deployment
----------

Single service (backend serves frontend):

1. Build the frontend:

```
npm run build
```

2. Ensure `.env` contains your production `MONGODB_URI` (e.g., MongoDB Atlas connection string).

3. Start the server locally to verify it serves the build:

```
npm run server
```

Or run the dedicated hosting entry (uses PORT=8080 by default):

```
npm run host
```

4. Deploy to a Node hosting provider (e.g., Render):
   - Create a Web Service from this repo
   - Build command: `npm install && npm run build`
   - Start command (MongoDB): `node server/hosting.js`
   - Start command (PostgreSQL): `node server/index.pg.js`
   - Env vars: set `MONGODB_URI` to your Atlas URI
    - Or set `DATABASE_URL` (Render Postgres) and optionally `DATABASE_SSL=false` if not needed

PostgreSQL (Render) quick setup
-------------------------------

1. In Render PostgreSQL settings, copy the Internal Database URL and set it as `DATABASE_URL` in your service env vars.
2. Ensure SSL works; if your environment doesn't require SSL, set `DATABASE_SSL=false`.
3. Use the Postgres server entry locally:

```
npm run server:pg
```

or in hosting with the React build served by the same process:

```
node server/index.pg.js
```

MongoDB Atlas setup:

- Create an Atlas cluster, add your IP to Network Access, create a database user, and copy the connection string. Replace `<password>` and set `MONGODB_URI`.

Separate services (optional):

- If you prefer separate hosting, deploy the backend as above, and host the React build on static hosting (e.g., Netlify). Update the frontend to call the deployed API URL instead of relying on CRA proxy.

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
