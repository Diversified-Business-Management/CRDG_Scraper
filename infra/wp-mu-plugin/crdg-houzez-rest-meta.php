<?php
/**
 * Plugin Name: CRDG — Expose Houzez fave_* meta to REST API
 * Description: Registers Houzez property meta keys (fave_property_price, fave_property_bedrooms, etc.) with show_in_rest=true so the CRDG listings pipeline can write them via the WP REST API. Drop into wp-content/mu-plugins/ — auto-activates, no UI.
 * Version: 1.0.0
 * Author: Costa Rica Dream Group
 */

if (!defined('ABSPATH')) exit;

add_action('init', function () {
    $string_keys = [
        'fave_property_id',
        'fave_property_size_prefix',
        'fave_currency',
        'fave_property_map_address',
        'fave_property_location',
        'fave_property_map',
        'fave_property_map_street_view',
        'fave_property_country',
        'fave_property_zip',
        'fave_video_url',
        'fave_virtual_tour',
        'fave_property_images',
    ];
    $number_keys = [
        'fave_property_price',
        'fave_property_bedrooms',
        'fave_property_bathrooms',
        'fave_property_size',
        'fave_property_land',
        'fave_property_year',
        'fave_property_hoa_dues',
        'fave_property_garage',
        'fave_property_rooms',
    ];

    foreach ($string_keys as $key) {
        register_post_meta('property', $key, [
            'type'         => 'string',
            'single'       => true,
            'show_in_rest' => true,
            'auth_callback' => function () { return current_user_can('edit_posts'); },
        ]);
    }
    foreach ($number_keys as $key) {
        register_post_meta('property', $key, [
            'type'         => 'string', // Houzez stores numerics as strings in postmeta
            'single'       => true,
            'show_in_rest' => true,
            'auth_callback' => function () { return current_user_can('edit_posts'); },
        ]);
    }
});
