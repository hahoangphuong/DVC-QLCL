import os
import requests
from bs4 import BeautifulSoup


# ---------------------------------------------------------------------------
# Exception riêng cho lỗi xác thực
# ---------------------------------------------------------------------------
class RemoteAuthError(Exception):
    """Raise khi đăng nhập thất bại hoặc server từ chối xác thực."""
    pass


# ---------------------------------------------------------------------------
# Hằng số User-Agent và Sec-CH-UA — khớp với Chrome 146 trong cURL
# ---------------------------------------------------------------------------
_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/146.0.0.0 Safari/537.36"
)
_SEC_CH_UA = '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"'


class RemoteClient:
    """
    Quản lý phiên đăng nhập tới dichvucong.dav.gov.vn (ABP Framework).

    Luồng sử dụng:
        client = RemoteClient()
        client.login()
        resp = client.fetch_data()
    """

    def __init__(self):
        base_url = os.environ.get("BASE_URL", "").rstrip("/")
        login_path = os.environ.get("LOGIN_PATH", "").lstrip("/")
        if not base_url:
            raise EnvironmentError("BASE_URL chưa được set trong environment.")

        self.base_url = base_url
        self.username = os.environ.get("REMOTE_USERNAME", "")
        self.password = os.environ.get("REMOTE_PASSWORD", "")
        self.data_url = os.environ.get("DATA_URL", "")

        if not self.username or not self.password:
            raise EnvironmentError("REMOTE_USERNAME hoặc REMOTE_PASSWORD chưa được set.")

        # URL GET trang login — dùng ?autosso=False đúng như referer trong cURL
        self.login_get_url = f"{base_url}/{login_path}?autosso=False"

        # URL POST đăng nhập — dùng ?returnUrl=/Application đúng như cURL
        self.login_post_url = f"{base_url}/{login_path}?returnUrl=/Application"

        self.session = requests.Session()

        # Set cookie ngôn ngữ trước khi GET — ABP cần cookie này để render đúng
        self.session.cookies.set(
            "Abp.Localization.CultureName", "en",
            domain=base_url.replace("https://", "").replace("http://", "")
        )

    # -----------------------------------------------------------------------
    # Bước 1: GET trang login với ?autosso=False — lấy cookie và HTML
    # -----------------------------------------------------------------------
    def _get_login_page(self) -> requests.Response:
        """
        GET trang login để nhận cookie session, XSRF-TOKEN,
        và __RequestVerificationToken từ server.
        URL dùng ?autosso=False khớp với referer trong cURL thực tế.
        """
        resp = self.session.get(
            self.login_get_url,
            timeout=15,
            headers={
                "User-Agent": _USER_AGENT,
                "Accept": (
                    "text/html,application/xhtml+xml,application/xml;"
                    "q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"
                ),
                "Accept-Language": "en-US,en;q=0.9,vi-VN;q=0.8,vi;q=0.7",
                "Cache-Control": "no-cache",
                "Pragma": "no-cache",
                "Sec-CH-UA": _SEC_CH_UA,
                "Sec-CH-UA-Mobile": "?0",
                "Sec-CH-UA-Platform": '"Windows"',
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "none",
            },
        )
        resp.raise_for_status()
        return resp

    # -----------------------------------------------------------------------
    # Bước 2: Đọc __RequestVerificationToken từ HTML (hidden input)
    # -----------------------------------------------------------------------
    def _extract_hidden_verification_token(self, html: str) -> str | None:
        """
        Parse HTML tìm hidden input __RequestVerificationToken.
        ABP thường đặt token này trong HTML form VÀ trong cookie.
        Trả None nếu không tìm thấy hoặc value rỗng.
        """
        soup = BeautifulSoup(html, "html.parser")
        token_input = soup.find("input", {"name": "__RequestVerificationToken"})
        if token_input:
            value = token_input.get("value")
            return value if value else None
        return None

    # -----------------------------------------------------------------------
    # Bước 3–6: POST đăng nhập khớp hoàn toàn với cURL
    # -----------------------------------------------------------------------
    def login(self) -> None:
        """
        Thực hiện đầy đủ luồng đăng nhập ABP:
          1. GET ?autosso=False → nhận cookie XSRF-TOKEN + __RequestVerificationToken
          2. Đọc token từ HTML (nếu có)
          3. POST ?returnUrl=/Application với headers và payload khớp cURL
          4. Kiểm tra JSON response: success / unAuthorizedRequest
        """
        # --- Bước 1: GET trang login ---
        login_page = self._get_login_page()

        # --- Bước 2: Đọc token từ HTML (ít khi dùng với ABP, nhưng fallback tốt) ---
        html_token = self._extract_hidden_verification_token(login_page.text)

        # --- Bước 3: Đọc XSRF-TOKEN từ cookie (ABP set sau GET) ---
        # XSRF-TOKEN cookie = giá trị gửi trong header x-xsrf-token
        xsrf_token = self.session.cookies.get("XSRF-TOKEN")

        # --- Bước 4: Chuẩn bị headers khớp với cURL ---
        headers = {
            "User-Agent": _USER_AGENT,
            # Accept khớp chính xác với cURL (text/javascript, không phải text/plain)
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Accept-Language": "en-US,en;q=0.9,vi-VN;q=0.8,vi;q=0.7",
            "Cache-Control": "no-cache",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            # Expires giả lập browser cache behaviour
            "Expires": "Sat, 01 Jan 2000 00:00:00 GMT",
            "Origin": self.base_url,
            "Pragma": "no-cache",
            "Priority": "u=1, i",
            # Referer = trang GET login với ?autosso=False
            "Referer": self.login_get_url,
            "Sec-CH-UA": _SEC_CH_UA,
            "Sec-CH-UA-Mobile": "?0",
            "Sec-CH-UA-Platform": '"Windows"',
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
            "X-Requested-With": "XMLHttpRequest",
        }
        # x-xsrf-token = giá trị cookie XSRF-TOKEN (bắt buộc với ABP)
        if xsrf_token:
            headers["x-xsrf-token"] = xsrf_token

        # --- Bước 5: Payload khớp với --data-raw trong cURL ---
        # Lưu ý: cURL không gửi __RequestVerificationToken trong body,
        # ABP chỉ kiểm tra qua header x-xsrf-token + cookie
        payload = {
            "returnUrlHash": "",
            "tenancyName": "",
            "usernameOrEmailAddress": self.username,
            "password": self.password,
            "code": "",
            "captchaText": "",
        }
        # Thêm token vào body chỉ khi tìm được từ HTML (defensive)
        if html_token:
            payload["__RequestVerificationToken"] = html_token

        # --- Bước 6: POST tới URL có ?returnUrl=/Application ---
        resp = self.session.post(
            self.login_post_url,
            data=payload,
            headers=headers,
            timeout=15,
            allow_redirects=True,
        )
        resp.raise_for_status()

        # --- Bước 7: Kiểm tra JSON response từ ABP ---
        # ABP trả: {"targetUrl": "...", "success": true}
        # hoặc:    {"unAuthorizedRequest": true, "success": false, "error": {...}}
        try:
            result = resp.json()
            if isinstance(result, dict):
                if result.get("unAuthorizedRequest") is True:
                    raise RemoteAuthError(
                        "Server trả về unAuthorizedRequest=true. "
                        "Kiểm tra REMOTE_USERNAME / REMOTE_PASSWORD."
                    )
                if result.get("success") is False:
                    error_obj = result.get("error") or {}
                    msg = error_obj.get("message", "Đăng nhập thất bại.")
                    raise RemoteAuthError(f"Đăng nhập thất bại: {msg}")
        except ValueError:
            # Response là HTML (redirect) — kiểm tra có bị đẩy về login không
            if "login" in resp.url.lower():
                raise RemoteAuthError(
                    "Đăng nhập thất bại (redirect về trang login). "
                    "Kiểm tra credentials hoặc XSRF token."
                )

    # -----------------------------------------------------------------------
    # Gọi API dữ liệu sau khi đăng nhập
    # -----------------------------------------------------------------------
    def fetch_data(self, url: str | None = None, params: dict | None = None) -> requests.Response:
        """
        Gọi DATA_URL bằng session đã xác thực.
        Tự động gửi lại x-xsrf-token và các header cần thiết.

        Args:
            url:    URL cần gọi. Nếu None sẽ dùng DATA_URL từ env.
            params: Query parameters (optional).
        """
        target_url = url or self.data_url
        if not target_url:
            raise ValueError(
                "Cần truyền url hoặc set DATA_URL trong environment. "
                "Ví dụ: https://dichvucong.dav.gov.vn/api/services/app/Order/GetAll"
            )

        xsrf = self.session.cookies.get("XSRF-TOKEN")
        headers = {
            "User-Agent": _USER_AGENT,
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Accept-Language": "en-US,en;q=0.9,vi-VN;q=0.8,vi;q=0.7",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Referer": self.base_url,
            "Sec-CH-UA": _SEC_CH_UA,
            "Sec-CH-UA-Mobile": "?0",
            "Sec-CH-UA-Platform": '"Windows"',
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
            "X-Requested-With": "XMLHttpRequest",
        }
        if xsrf:
            headers["x-xsrf-token"] = xsrf

        resp = self.session.get(target_url, headers=headers, params=params, timeout=15)
        resp.raise_for_status()
        return resp

    # -----------------------------------------------------------------------
    # Debug helper
    # -----------------------------------------------------------------------
    def debug_cookies(self) -> dict:
        """Trả về dict tên cookie → giá trị để kiểm tra session."""
        return {name: value for name, value in self.session.cookies.items()}
