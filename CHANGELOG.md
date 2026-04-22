# Changelog

All notable changes to the **10 Λεπτά Ακόμα** Home Assistant add-on are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-04-22

### Added

- Initial release of the add-on
- Automatic episode scraping from ertecho.gr (weekdays at 21:00 Athens time)
- Web UI for browsing and playing episodes
- Podcast RSS 2.0 feed compatible with podcast clients (Podcast Addict, AntennaPod, etc.)
- SQLite database for episode metadata
- Support for episode descriptions, durations, and file metadata
- HTTP range request support for audio streaming
- Home Assistant sidebar integration via ingress
- Multi-architecture support (amd64, arm64, armhf, armv7, i386)
- Configurable base URL for RSS enclosure links
- Local storage of MP3 files (`/share/ertecho-pod/`)
- Comprehensive documentation (ARCHITECTURE.md, DEVELOPMENT.md, DEPLOYMENT.md)

### Technical

- SvelteKit web framework
- better-sqlite3 for database management
- node-cron for scheduled episode sync
- S6 overlay for process supervision
- Two-stage Docker build for multi-arch support
