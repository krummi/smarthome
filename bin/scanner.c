#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>
#include <fcntl.h>
#include <dirent.h>
#include <linux/input.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <sys/select.h>
#include <sys/time.h>
#include <termios.h>
#include <signal.h>
#include <stdio.h>
#include <curl/curl.h>
#include <string>

void post(std::string barcode) {
  CURL *curl;
  CURLcode res;

  // Construct the URL:
  std::string url = "http://192.168.1.35:3000/add-to-shopping-cart?barcode=" + barcode;

  /* In windows, this will init the winsock stuff */
  curl_global_init(CURL_GLOBAL_ALL);

  /* get a curl handle */
  curl = curl_easy_init();
  if(curl) {
    // curl_easy_setopt(curl, CURLOPT_URL, "http://192.168.1.35:3000");
    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    /* Now specify the POST data */
    // curl_easy_setopt(curl, CURLOPT_POST, 1);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, "");
    /* Perform the request, res will get the return code */
    res = curl_easy_perform(curl);
    if(res != CURLE_OK) {
      fprintf(stderr, "curl_easy_perform() failed: %s\n",
              curl_easy_strerror(res));
    }
    curl_easy_cleanup(curl);
  }
  curl_global_cleanup();
}

int main(int argc, char* argv[])
{
    struct input_event ev[64];
    int fevdev = -1;
    int result = 0;
    int size = sizeof(struct input_event);
    int rd;
    int value;
    char name[256] = "Unknown";
    char *device = "/dev/input/event2";


    fevdev = open(device, O_RDONLY);
    if (fevdev == -1) {
        printf("Failed to open event device.\n");
        exit(1);
    }

    result = ioctl(fevdev, EVIOCGNAME(sizeof(name)), name);
    printf ("Reading From : %s (%s)\n", device, name);

    printf("Getting exclusive access: ");
    result = ioctl(fevdev, EVIOCGRAB, 1);
    printf("%s\n", (result == 0) ? "SUCCESS" : "FAILURE");

    std::string buffer = "";
    while (1)
    {
        if ((rd = read(fevdev, ev, size * 64)) < size) {
            break;
        }

        value = ev[0].value;

        if (value != ' ' && ev[1].value == 1 && ev[1].type == 1) {
            int n = ev[1].code - 1 == 10 ? 0 : ev[1].code - 1;
            if (n != 27) {
                buffer += (n + '0');
                printf ("%d", n);
            } else {
                printf("\n");
                post(buffer);
                buffer = "";
            }
        }
    }

    printf("Exiting.\n");
    result = ioctl(fevdev, EVIOCGRAB, 1);
    close(fevdev);
}
