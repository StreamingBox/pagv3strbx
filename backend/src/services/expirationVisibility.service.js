/**
 * A master account marked inactive is a known failed account. Its old
 * subscription can remain in the database for traceability, but it should
 * not keep appearing in expiration work queues. Replacements point the
 * subscription to a different platform account, so they remain visible.
 */
function excludeInactiveMasterAccountSql({ subscriptionAlias = "s", accountAlias = "acc" } = {}) {
    return `NOT EXISTS (
        SELECT 1
          FROM master_accounts ma
         WHERE ma.status = 'inactive'
           AND COALESCE(${accountAlias}.email, '') <> ''
           AND LOWER(TRIM(ma.account_email)) = LOWER(TRIM(${accountAlias}.email))
           AND ma.platform_id IN (
                ${subscriptionAlias}.platform_id,
                ${accountAlias}.platform_id,
                COALESCE(${subscriptionAlias}.delivered_platform_id, ${subscriptionAlias}.platform_id)
           )
    )`;
}

function excludeInactiveMasterAccountByEmailSql({ accountAlias = "pa" } = {}) {
    return `NOT EXISTS (
        SELECT 1
          FROM master_accounts ma
         WHERE ma.status = 'inactive'
           AND COALESCE(${accountAlias}.email, '') <> ''
           AND LOWER(TRIM(ma.account_email)) = LOWER(TRIM(${accountAlias}.email))
    )`;
}

function excludeManuallyHiddenExpirationSql({ subscriptionAlias = "s" } = {}) {
    return `${subscriptionAlias}.expiration_hidden_at IS NULL`;
}

module.exports = {
    excludeInactiveMasterAccountSql,
    excludeInactiveMasterAccountByEmailSql,
    excludeManuallyHiddenExpirationSql,
};
