# Deployment Templates

This directory contains configuration templates for the course-project deployment variants.

## Nginx + uWSGI

- `nginx/redirectiq.conf` assumes Nginx serves static frontend assets directly.
- `uwsgi/redirectiq.ini` runs the Flask app through `python-flask/wsgi.py`.
- Update filesystem paths, ports, and virtualenv locations before use.

## Apache + mod_wsgi

- `apache/redirectiq.conf` exposes the Flask app through `mod_wsgi`.
- Static files under `frontend/dist` are served directly by Apache aliases.
- Update the `python-home`, `python-path`, and repository paths for your machine.

## Suggested Deployment Ports

- Node.js: `3001`
- Flask dev server: `3002`
- Nginx + uWSGI: `8080`
- Apache + mod_wsgi: `8081`

## Notes

- The React frontend should be built first with `npm run build` in `frontend/`.
- The Flask app uses `wsgi.py` for both uWSGI and mod_wsgi.
- These are intentionally explicit template files so your final report can discuss setup complexity and debugging effort.
