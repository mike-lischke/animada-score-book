[![GitHub Workflow Status (with event)](https://img.shields.io/github/actions/workflow/status/mike-lischke/animada-score-book/nodejs.yml?branch=main&style=for-the-badge&color=green&logo=github)](https://github.com/mike-lischke/animada-score-book/actions/workflows/nodejs.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=for-the-badge&color=green)](./License.txt)

<p align="center">
<img src="public/logo.svg" title="Animada Score Book" alt="Animada Score Book" style="height: 200px" /><br/>
</p>

<hr />

# Animada Score Book

Score management and arrangement app for our **Banda Animada de Samba** group – tailored for Samba ensembles.

Originally based on [BananaDrum](https://github.com/mooseling/BananaDrum).

## Development Setup

- Base API URL: Configure the backend base path used in development.
	- Create a `.env.local` (preferred) or edit `.env` and set `VITE_BASE_URL`.
	- Example: `VITE_BASE_URL="http://samba.<your-domain>.net"`
	- This value is read by the app via `import.meta.env.VITE_BASE_URL` when running on `localhost` or `127.0.0.1`.
	- In production builds, the app uses the same origin as the served app (empty base).
