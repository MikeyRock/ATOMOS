:80 {
    root * /var/www/html

    header {
        Cache-Control "no-cache, no-store, must-revalidate"
    }

    file_server

    log {
        output stdout
        format %%LOGFORMAT%%
        level %%LOGLEVEL%%
    }
}
