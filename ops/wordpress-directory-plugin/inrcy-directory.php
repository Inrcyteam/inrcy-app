<?php
/**
 * Plugin Name: iNrCy Annuaire
 * Description: Affiche dans WordPress un annuaire server-side des pages iNrSearch publiées.
 * Version: 1.1.0
 * Author: iNrCy
 * License: GPL-2.0-or-later
 */

if (!defined('ABSPATH')) {
    exit;
}

define('INRCY_DIRECTORY_API_URL', 'https://app.inrcy.com/api/public/inrsearch/directory');
define('INRCY_DIRECTORY_CACHE_TTL', 300);

function inrcy_directory_get_filter($key) {
    if (!isset($_GET[$key]) || is_array($_GET[$key])) {
        return '';
    }

    return sanitize_text_field(wp_unslash($_GET[$key]));
}

function inrcy_directory_api_url($filters, $page = 1) {
    $query = array(
        'page' => max(1, absint($page)),
        'pageSize' => 12,
    );

    foreach (array('q', 'metier', 'secteur', 'ville', 'departement', 'region') as $key) {
        if (!empty($filters[$key])) {
            $query[$key] = $filters[$key];
        }
    }

    return add_query_arg($query, INRCY_DIRECTORY_API_URL);
}

function inrcy_directory_fetch($filters, $page = 1) {
    $url = inrcy_directory_api_url($filters, $page);
    $cache_key = 'inrcy_directory_' . md5($url);
    $cached = get_transient($cache_key);

    if (is_array($cached)) {
        return $cached;
    }

    $response = wp_remote_get($url, array(
        'timeout' => 8,
        'headers' => array(
            'Accept' => 'application/json',
            'User-Agent' => 'iNrCy-WordPress-Directory/1.0',
        ),
    ));

    if (is_wp_error($response)) {
        return array('ok' => false, 'items' => array(), 'total' => 0, 'facets' => array());
    }

    $status = wp_remote_retrieve_response_code($response);
    $body = json_decode(wp_remote_retrieve_body($response), true);

    if ($status < 200 || $status >= 300 || !is_array($body) || empty($body['ok'])) {
        return array('ok' => false, 'items' => array(), 'total' => 0, 'facets' => array());
    }

    set_transient($cache_key, $body, INRCY_DIRECTORY_CACHE_TTL);
    return $body;
}

function inrcy_directory_render_options($items, $selected) {
    if (!is_array($items)) {
        return;
    }

    foreach ($items as $item) {
        if (!is_array($item) || empty($item['slug']) || empty($item['label'])) {
            continue;
        }

        $value = sanitize_text_field((string) $item['slug']);
        $label = sanitize_text_field((string) $item['label']);
        $count = isset($item['count']) ? absint($item['count']) : 0;
        printf(
            '<option value="%1$s"%2$s>%3$s%4$s</option>',
            esc_attr($value),
            selected($selected, $value, false),
            esc_html($label),
            $count ? esc_html(' (' . $count . ')') : ''
        );
    }
}

function inrcy_directory_render_pagination($page, $has_next, $filters, $total, $page_size = 12) {
    $links = array();
    $page_count = max(1, (int) ceil($total / max(1, $page_size)));

    if ($page_count <= 1) {
        return '';
    }

    if ($page > 1) {
        $links[] = sprintf(
            '<a class="inrcy-directory__page" href="%s">← Précédent</a>',
            esc_url(add_query_arg(array_merge($filters, array('page' => $page - 1)), get_permalink()))
        );
    }

    $start = max(1, $page - 2);
    $end = min($page_count, $start + 4);
    $start = max(1, $end - 4);

    for ($number = $start; $number <= $end; $number++) {
        $url = esc_url(add_query_arg(array_merge($filters, array('page' => $number)), get_permalink()));
        if ($number === $page) {
            $links[] = sprintf(
                '<span class="inrcy-directory__page inrcy-directory__page--current" aria-current="page">%s</span>',
                esc_html($number)
            );
        } else {
            $links[] = sprintf(
                '<a class="inrcy-directory__page" href="%s">%s</a>',
                $url,
                esc_html($number)
            );
        }
    }

    if ($has_next) {
        $links[] = sprintf(
            '<a class="inrcy-directory__page" href="%s">Suivant →</a>',
            esc_url(add_query_arg(array_merge($filters, array('page' => $page + 1)), get_permalink()))
        );
    }

    if (!$links) {
        return '';
    }

    return '<nav class="inrcy-directory__pagination" aria-label="Pagination de l’annuaire">' . implode('', $links) . '</nav>';
}

function inrcy_directory_render_schema($data) {
    if (empty($data['items']) || !is_array($data['items'])) {
        return '';
    }

    $elements = array();
    foreach ($data['items'] as $position => $item) {
        if (!is_array($item) || empty($item['url']) || empty($item['companyName'])) {
            continue;
        }

        $elements[] = array(
            '@type' => 'ListItem',
            'position' => $position + 1,
            'url' => esc_url_raw($item['url']),
            'name' => sanitize_text_field((string) $item['companyName']),
        );
    }

    if (!$elements) {
        return '';
    }

    $schema = array(
        '@context' => 'https://schema.org',
        '@type' => 'CollectionPage',
        'name' => 'Annuaire iNrCy des professionnels',
        'url' => get_permalink(),
        'mainEntity' => array(
            '@type' => 'ItemList',
            'numberOfItems' => count($elements),
            'itemListElement' => $elements,
        ),
    );

    return '<script type="application/ld+json">' . wp_json_encode($schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . '</script>';
}

function inrcy_directory_shortcode() {
    $filters = array(
        'q' => inrcy_directory_get_filter('q'),
        'metier' => inrcy_directory_get_filter('metier'),
        'secteur' => inrcy_directory_get_filter('secteur'),
        'ville' => inrcy_directory_get_filter('ville'),
        'departement' => inrcy_directory_get_filter('departement'),
        'region' => inrcy_directory_get_filter('region'),
    );
    $page = max(1, absint(inrcy_directory_get_filter('page')));
    $data = inrcy_directory_fetch($filters, $page);
    $facets = !empty($data['facets']) && is_array($data['facets']) ? $data['facets'] : array();
    $items = !empty($data['items']) && is_array($data['items']) ? $data['items'] : array();
    $total = isset($data['total']) ? absint($data['total']) : 0;
    $has_next = !empty($data['hasNext']);
    $active_filters = array_filter($filters);

    ob_start();
    ?>
    <section class="inrcy-directory" aria-labelledby="inrcy-directory-title">
        <div class="inrcy-directory__hero">
            <span class="inrcy-directory__eyebrow">Annuaire professionnel iNrCy</span>
            <h1 id="inrcy-directory-title">Trouvez le bon professionnel près de chez vous</h1>
            <p>Explorez les pages iNrSearch des professionnels accompagnés par iNrCy. Chaque profil présente son activité, ses services et sa zone d’intervention.</p>
        </div>

        <form class="inrcy-directory__filters" method="get" action="<?php echo esc_url(get_permalink()); ?>" role="search">
            <label class="inrcy-directory__field inrcy-directory__field--wide">
                <span>Recherche</span>
                <input type="search" name="q" value="<?php echo esc_attr($filters['q']); ?>" placeholder="Métier, entreprise ou besoin…">
            </label>
            <label class="inrcy-directory__field">
                <span>Métier</span>
                <select name="metier">
                    <option value="">Tous les métiers</option>
                    <?php inrcy_directory_render_options($facets['professions'] ?? array(), $filters['metier']); ?>
                </select>
            </label>
            <label class="inrcy-directory__field">
                <span>Ville</span>
                <select name="ville">
                    <option value="">Toutes les villes</option>
                    <?php inrcy_directory_render_options($facets['cities'] ?? array(), $filters['ville']); ?>
                </select>
            </label>
            <label class="inrcy-directory__field">
                <span>Région</span>
                <select name="region">
                    <option value="">Toutes les régions</option>
                    <?php inrcy_directory_render_options($facets['regions'] ?? array(), $filters['region']); ?>
                </select>
            </label>
            <button class="inrcy-directory__submit" type="submit">Rechercher</button>
            <?php if ($active_filters) : ?>
                <a class="inrcy-directory__reset" href="<?php echo esc_url(get_permalink()); ?>">Réinitialiser</a>
            <?php endif; ?>
        </form>

        <div class="inrcy-directory__summary" aria-live="polite">
            <strong><?php echo esc_html(number_format_i18n($total)); ?></strong>
            professionnel<?php echo $total > 1 ? 's' : ''; ?> référencé<?php echo $total > 1 ? 's' : ''; ?>
        </div>

        <?php if (!empty($data['ok']) && $items) : ?>
            <div class="inrcy-directory__grid">
                <?php foreach ($items as $item) : ?>
                    <?php
                    if (!is_array($item) || empty($item['url']) || empty($item['companyName'])) {
                        continue;
                    }
                    $location = implode(' · ', array_filter(array(
                        sanitize_text_field((string) ($item['city'] ?? '')),
                        sanitize_text_field((string) ($item['department'] ?? '')),
                        sanitize_text_field((string) ($item['region'] ?? '')),
                    )));
                    ?>
                    <article class="inrcy-directory__card">
                        <div class="inrcy-directory__card-top">
                            <span class="inrcy-directory__card-kicker">Profil iNr’Search</span>
                            <span class="inrcy-directory__card-mark" aria-hidden="true">iN</span>
                        </div>
                        <h2><a href="<?php echo esc_url($item['url']); ?>"><?php echo esc_html($item['companyName']); ?></a></h2>
                        <?php if (!empty($item['profession'])) : ?>
                            <p class="inrcy-directory__profession"><?php echo esc_html($item['profession']); ?></p>
                        <?php endif; ?>
                        <?php if ($location) : ?>
                            <p class="inrcy-directory__location">⌖ <?php echo esc_html($location); ?></p>
                        <?php endif; ?>
                        <?php if (!empty($item['pageDescription'])) : ?>
                            <p><?php echo esc_html(wp_trim_words((string) $item['pageDescription'], 30)); ?></p>
                        <?php endif; ?>
                        <div class="inrcy-directory__card-footer">
                            <a class="inrcy-directory__card-link" href="<?php echo esc_url($item['url']); ?>">Voir le profil</a>
                            <span class="inrcy-directory__card-arrow" aria-hidden="true">↗</span>
                        </div>
                    </article>
                <?php endforeach; ?>
            </div>
        <?php elseif (!empty($data['ok'])) : ?>
            <div class="inrcy-directory__empty">
                <h2>Aucun professionnel ne correspond à cette recherche</h2>
                <p>Essayez un métier, une ville ou une recherche plus générale.</p>
            </div>
        <?php else : ?>
            <div class="inrcy-directory__empty">
                <h2>L’annuaire se met à jour</h2>
                <p>Les profils seront de nouveau disponibles dans quelques instants.</p>
            </div>
        <?php endif; ?>

        <?php echo inrcy_directory_render_pagination($page, $has_next, $active_filters, $total, isset($data['pageSize']) ? absint($data['pageSize']) : 12); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
        <p class="inrcy-directory__note">Les profils sont publiés et actualisés automatiquement depuis iNrCy.</p>
    </section>
    <?php
    echo inrcy_directory_render_schema($data); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
    return ob_get_clean();
}

add_shortcode('inrcy_directory', 'inrcy_directory_shortcode');

function inrcy_directory_enqueue_styles() {
    if (!is_singular()) {
        return;
    }

    $post = get_post();
    if (!$post || !has_shortcode((string) $post->post_content, 'inrcy_directory')) {
        return;
    }

    wp_register_style('inrcy-directory', false, array(), '1.1.0');
    wp_enqueue_style('inrcy-directory');
    $css = <<<'INRCY_DIRECTORY_CSS'
        .inrcy-directory{max-width:1180px;margin:0 auto;padding:72px 24px 96px;color:#101a38}
        .inrcy-directory__hero{max-width:820px;margin:0 auto 34px;text-align:center}
        .inrcy-directory__eyebrow{display:inline-flex;padding:8px 15px;border:1px solid #ffd2e5;border-radius:999px;color:#6d43a8;background:#fff7fb;font-size:13px;font-weight:700;letter-spacing:.03em}
        .inrcy-directory h1{margin:20px 0 14px;font-size:clamp(34px,5vw,60px);line-height:1.05;letter-spacing:-.04em;background:linear-gradient(90deg,#f72f91,#ff684f,#7449e7,#119df5);-webkit-background-clip:text;background-clip:text;color:transparent}
        .inrcy-directory__hero p{margin:0 auto;color:#60708f;font-size:18px;line-height:1.65}
        .inrcy-directory__filters{display:grid;grid-template-columns:2fr repeat(3,1fr) auto;gap:12px;align-items:end;margin:38px 0 22px;padding:20px;border:1px solid #e5e9f5;border-radius:22px;background:#fff;box-shadow:0 18px 50px rgba(31,48,105,.10)}
        .inrcy-directory__field{display:grid;gap:7px;font-size:12px;font-weight:800;color:#344260;text-transform:uppercase;letter-spacing:.04em}
        .inrcy-directory__field input,.inrcy-directory__field select{width:100%;min-height:48px;padding:0 14px;border:1px solid #dce2f1;border-radius:12px;background:#f9faff;color:#172242;font:inherit;font-size:15px;font-weight:500;text-transform:none;letter-spacing:0}
        .inrcy-directory__submit{min-height:48px;padding:0 22px;border:0;border-radius:999px;background:linear-gradient(100deg,#ff3d9a,#ff654d,#8d43e7,#149cf5);color:#fff;font:inherit;font-weight:800;cursor:pointer;box-shadow:0 10px 24px rgba(146,67,231,.22)}
        .inrcy-directory__reset{grid-column:1/-1;color:#6a45be;font-size:14px;text-decoration:underline}
        .inrcy-directory__summary{margin:26px 0 18px;color:#687693;font-size:15px}.inrcy-directory__summary strong{color:#16213f;font-size:22px}
        .inrcy-directory__grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
        .inrcy-directory__card{position:relative;display:flex;min-height:278px;overflow:hidden;flex-direction:column;padding:20px;border:1px solid rgba(126,98,255,.28);border-radius:22px;background:radial-gradient(circle at 90% 0%,rgba(47,190,255,.24),transparent 40%),linear-gradient(145deg,#101a38,#211b4d 58%,#172c5c);box-shadow:0 16px 34px rgba(25,35,83,.18);color:#f8fafc;transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}
        .inrcy-directory__card::after{position:absolute;right:-38px;bottom:-54px;width:150px;height:150px;border-radius:50%;background:radial-gradient(circle,rgba(255,67,151,.26),transparent 68%);content:"";pointer-events:none}.inrcy-directory__card:hover{transform:translateY(-5px);border-color:rgba(82,194,255,.65);box-shadow:0 24px 48px rgba(29,43,111,.28)}
        .inrcy-directory__card-top{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:10px}.inrcy-directory__card-kicker{color:#c4b5fd;font-size:10px;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.inrcy-directory__card-mark{display:grid;width:34px;height:34px;place-items:center;border:1px solid rgba(98,211,255,.45);border-radius:11px;background:linear-gradient(145deg,#ff3d9a,#8157ff 58%,#1cacf4);color:#fff;font-size:12px;font-weight:950;box-shadow:0 7px 18px rgba(91,84,255,.35)}
        .inrcy-directory__card h2{position:relative;z-index:1;margin:19px 0 7px;font-size:23px;line-height:1.12;letter-spacing:-.025em}.inrcy-directory__card h2 a{color:#fff;text-decoration:none}.inrcy-directory__card h2 a:hover{color:#8be7ff}.inrcy-directory__profession{position:relative;z-index:1;margin:0;color:#ff83b7;font-size:14px;font-weight:850}.inrcy-directory__location{position:relative;z-index:1;margin:12px 0 0;color:#cbd5e1;font-size:13px}.inrcy-directory__card>p:not(.inrcy-directory__profession):not(.inrcy-directory__location){position:relative;z-index:1;margin-bottom:0;color:#cbd5e1;line-height:1.52;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.inrcy-directory__card-footer{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:auto;padding-top:18px}.inrcy-directory__card-link{color:#fff;font-size:14px;font-weight:900;text-decoration:none}.inrcy-directory__card-link:hover{color:#8be7ff}.inrcy-directory__card-arrow{display:grid;width:32px;height:32px;place-items:center;border:1px solid rgba(255,255,255,.22);border-radius:50%;color:#fff;font-size:18px;transition:transform .18s ease,background .18s ease}.inrcy-directory__card:hover .inrcy-directory__card-arrow{transform:translate(2px,-2px);background:rgba(255,255,255,.14)}
        .inrcy-directory__empty{padding:38px;border-radius:22px;background:#f8f9ff;text-align:center}.inrcy-directory__empty h2{margin:0 0 8px;color:#1c2746}.inrcy-directory__empty p{margin:0;color:#69758e}.inrcy-directory__pagination{display:flex;justify-content:center;align-items:center;gap:7px;margin:32px 0;flex-wrap:wrap}.inrcy-directory__page{display:inline-grid;min-width:40px;min-height:40px;padding:0 13px;place-items:center;border:1px solid #dce2f1;border-radius:999px;color:#334fe4;font-weight:850;text-decoration:none;background:#fff;box-shadow:0 7px 18px rgba(31,45,94,.06)}.inrcy-directory__page:hover,.inrcy-directory__page--current{border-color:transparent;background:linear-gradient(100deg,#ff3d9a,#8354ef,#149cf5);color:#fff}.inrcy-directory__note{margin:26px 0 0;color:#8490a7;font-size:13px;text-align:center}
        @media (max-width:900px){.inrcy-directory__filters{grid-template-columns:repeat(2,1fr)}.inrcy-directory__field--wide{grid-column:1/-1}.inrcy-directory__submit{grid-column:1/-1}.inrcy-directory__grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media (max-width:560px){.inrcy-directory{padding:46px 16px 68px}.inrcy-directory__filters,.inrcy-directory__grid{grid-template-columns:1fr}.inrcy-directory__reset{grid-column:auto}.inrcy-directory__hero p{font-size:16px}}
    INRCY_DIRECTORY_CSS;
    wp_add_inline_style('inrcy-directory', $css);
}

add_action('wp_enqueue_scripts', 'inrcy_directory_enqueue_styles');

function inrcy_directory_rank_math_title($title) {
    if (is_page('annuaire')) {
        return 'Annuaire de professionnels près de chez vous | iNrCy';
    }

    return $title;
}

function inrcy_directory_rank_math_description($description) {
    if (is_page('annuaire')) {
        return 'Trouvez un professionnel par métier et par zone géographique grâce à l’annuaire iNrCy et découvrez sa page iNrSearch.';
    }

    return $description;
}

add_filter('rank_math/frontend/title', 'inrcy_directory_rank_math_title');
add_filter('rank_math/frontend/description', 'inrcy_directory_rank_math_description');
